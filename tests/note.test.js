import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Note } from '../src/note.js';

describe('Note', () => {
  it('round-trips through markdown front-matter', () => {
    const note = new Note({ id: 'abc', title: 'Hello', body: 'Some body', tags: ['A', 'a', 'b'] });
    const back = Note.parse('abc', note.toMarkdown());
    assert.equal(back.title, 'Hello');
    assert.equal(back.body, 'Some body');
    assert.deepEqual(back.tags, ['a', 'b']);
    assert.ok(back.createdAt instanceof Date);
  });

  it('rejects notes without title or id', () => {
    assert.throws(() => new Note({ id: '', title: 'x' }), /id is required/);
    assert.throws(() => new Note({ id: 'x', title: '  ' }), /title is required/);
  });

  it('rejects markdown without front-matter or title', () => {
    assert.throws(() => Note.parse('x', 'no header here'), /front-matter/);
    assert.throws(() => Note.parse('x', '---\ntags: []\n---\nbody'), /missing a title/);
  });

  it('generates a stable-looking unique id from the title', () => {
    const id = Note.newId('Hello, World!');
    assert.match(id, /^hello-world-[a-z0-9]+$/);
    assert.notEqual(id, Note.newId('Hello, World!'));
  });

  it('exposes title, body and tags as searchable text', () => {
    const note = new Note({ id: 'x', title: 'T', body: 'B', tags: ['tag'] });
    assert.ok(note.text.includes('T') && note.text.includes('B') && note.text.includes('tag'));
  });
});
