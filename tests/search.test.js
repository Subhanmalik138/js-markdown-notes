import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InvertedIndex } from '../src/indexer.js';
import { search, parseQuery, snippetFor } from '../src/search.js';
import { Note } from '../src/note.js';

const note = (id, title, body, tags = []) => new Note({ id, title, body, tags });

describe('search', () => {
  const notes = [
    note('a', 'Backup runbook', 'run pg_dump nightly and verify checksums', ['ops']),
    note('b', 'Backup strategy', 'offsite backup copies protect data', ['ops']),
    note('c', 'Sourdough', 'feed the starter daily', ['cooking']),
  ];
  const byId = new Map(notes.map((n) => [n.id, n]));
  const index = InvertedIndex.build(notes);
  const titles = (q) => search(index, byId, q).map((r) => r.note.title);

  it('ANDs terms and ranks by TF-IDF', () => {
    const results = titles('backup');
    assert.deepEqual(results, ['Backup strategy', 'Backup runbook']);
  });

  it('matches exact phrases', () => {
    assert.deepEqual(titles('"pg_dump nightly"'), ['Backup runbook']);
    assert.deepEqual(titles('"nightly pg_dump"'), []);
  });

  it('supports exclusion', () => {
    assert.deepEqual(titles('backup -strategy'), ['Backup runbook']);
  });

  it('supports prefix wildcards', () => {
    assert.deepEqual(titles('back*').sort(), ['Backup runbook', 'Backup strategy']);
  });

  it('searches tags as well as body text', () => {
    assert.deepEqual(titles('cooking'), ['Sourdough']);
  });

  it('returns nothing for stop-word-only or empty queries', () => {
    assert.deepEqual(titles('the'), []);
    assert.deepEqual(titles(''), []);
  });

  it('builds snippets with highlighted matches', () => {
    const hit = search(index, byId, 'sourdough')[0];
    assert.ok(hit.snippet.includes('**Sourdough**'));
    assert.ok(hit.snippet.length <= 200);
  });
});

describe('parseQuery', () => {
  it('splits phrases, exclusions and prefixes', () => {
    const { phrases, terms } = parseQuery('"quick fox" jump -lazy run*');
    assert.deepEqual(phrases, [['quick', 'fox']]);
    assert.deepEqual(terms, [
      { term: 'jump', exclude: false, prefix: false },
      { term: 'lazy', exclude: true, prefix: false },
      { term: 'run', exclude: false, prefix: true },
    ]);
  });
});

describe('snippetFor', () => {
  it('falls back to the start of the text with no matches', () => {
    const n = note('x', 'Title', 'plain body');
    assert.ok(snippetFor(n, ['zzz']).startsWith('Title'));
  });
});
