import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NotesStore } from '../src/store.js';

describe('NotesStore', () => {
  let store;
  beforeEach(async () => {
    store = new NotesStore(join(await mkdtemp(join(tmpdir(), 'notes-')), 'data'));
  });

  it('creates and reads notes', async () => {
    const note = await store.create({ title: 'First', body: 'hello', tags: ['Todo'] });
    const got = await store.get(note.id);
    assert.equal(got.title, 'First');
    assert.deepEqual(got.tags, ['todo']);
  });

  it('returns null for unknown ids', async () => {
    assert.equal(await store.get('missing'), null);
    assert.equal(await store.update('missing', { title: 'x' }), null);
    assert.equal(await store.remove('missing'), false);
  });

  it('lists notes newest-first and updates in place', async () => {
    const a = await store.create({ title: 'A' });
    const b = await store.create({ title: 'B' });
    const updated = await store.update(a.id, { body: 'new body' });
    assert.equal(updated.body, 'new body');
    const [first] = await store.list();
    assert.equal(first.id, a.id); // updatedAt bumped a to the top
    assert.ok(b.id !== a.id);
  });

  it('removes notes', async () => {
    const note = await store.create({ title: 'Temp' });
    assert.equal(await store.remove(note.id), true);
    assert.equal(await store.get(note.id), null);
  });

  it('finds notes by tag and counts all tags', async () => {
    await store.create({ title: 'One', tags: ['ops', 'db'] });
    await store.create({ title: 'Two', tags: ['ops'] });
    assert.equal((await store.findByTag('OPS')).length, 2);
    assert.deepEqual(await store.allTags(), [
      { tag: 'ops', count: 2 },
      { tag: 'db', count: 1 },
    ]);
  });

  it('reports the newest note mtime for index freshness checks', async () => {
    await store.create({ title: 'M' });
    assert.ok((await store.newestMtime()) > 0);
  });
});
