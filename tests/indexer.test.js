import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InvertedIndex, tokenize } from '../src/indexer.js';
import { Note } from '../src/note.js';

const note = (id, title, body, tags = []) => new Note({ id, title, body, tags });

describe('tokenize', () => {
  it('lowercases, drops stop words and one-letter tokens', () => {
    assert.deepEqual(tokenize('The QUICK brown fox'), ['quick', 'brown', 'fox']);
  });
});

describe('InvertedIndex', () => {
  const notes = [
    note('a', 'Postgres runbook', 'run pg_dump nightly'),
    note('b', 'Sourdough', 'feed the starter'),
  ];
  const index = InvertedIndex.build(notes);

  it('records term positions per document', () => {
    assert.deepEqual(index.positions('pg', 'a'), [3]);
    assert.deepEqual(index.positions('dump', 'a'), [4]);
    assert.equal(index.positions('pg', 'b'), null);
  });

  it('computes idf higher for rarer terms', () => {
    assert.ok(index.idf('sourdough') > 0);
    assert.equal(index.idf('missing-term'), 0);
  });

  it('expands prefixes to indexed terms', () => {
    assert.deepEqual(index.expandPrefix('sour'), ['sourdough']);
    assert.deepEqual(index.expandPrefix('zzz'), []);
  });

  it('persists to disk and reloads', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'idx-'));
    try {
      const path = join(dir, 'index.json');
      await index.save(path);
      const loaded = await InvertedIndex.load(path);
      assert.equal(loaded.size, 2);
      assert.deepEqual(loaded.positions('starter', 'b'), [2]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
