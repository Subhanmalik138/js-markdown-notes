// NotesStore: CRUD over a directory of markdown files. One file per note
// (`<id>.md`), so notes stay portable and version-control friendly. Malformed
// files are reported with a clear error naming the offending file.

import { readdir, readFile, writeFile, rename, unlink, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Note } from './note.js';

export class NotesStore {
  constructor(dir) {
    if (!dir) throw new Error('store directory is required');
    this.dir = dir;
    this.indexPath = join(dir, '.index.json');
  }

  async init() {
    await mkdir(this.dir, { recursive: true });
  }

  _path(id) {
    if (!/^[\w-]+$/.test(id)) throw new Error(`invalid note id: "${id}"`);
    return join(this.dir, `${id}.md`);
  }

  async create({ title, body = '', tags = [] }) {
    await this.init();
    const note = new Note({ id: Note.newId(title), title, body, tags });
    await writeFile(this._path(note.id), note.toMarkdown(), 'utf8');
    return note;
  }

  async get(id) {
    let raw;
    try {
      raw = await readFile(this._path(id), 'utf8');
    } catch {
      return null;
    }
    return Note.parse(id, raw);
  }

  async list() {
    await this.init();
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.md'));
    const notes = [];
    for (const file of files) {
      const id = file.slice(0, -3);
      notes.push(Note.parse(id, await readFile(join(this.dir, file), 'utf8')));
    }
    return notes.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async update(id, { title, body, tags }) {
    const note = await this.get(id);
    if (!note) return null;
    if (title !== undefined) note.title = title;
    if (body !== undefined) note.body = body;
    if (tags !== undefined) {
      note.tags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    }
    note.updatedAt = new Date();
    const newPath = this._path(note.id);
    await writeFile(newPath + '.tmp', note.toMarkdown(), 'utf8');
    await rename(newPath + '.tmp', newPath); // atomic write
    return note;
  }

  async remove(id) {
    try {
      await unlink(this._path(id));
      return true;
    } catch {
      return false;
    }
  }

  async findByTag(tag) {
    const wanted = tag.trim().toLowerCase();
    return (await this.list()).filter((note) => note.tags.includes(wanted));
  }

  async allTags() {
    const counts = new Map();
    for (const note of await this.list()) {
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));
  }

  /** Newest mtime across note files; used to detect a stale search index. */
  async newestMtime() {
    await this.init();
    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.md'));
    let newest = 0;
    for (const file of files) {
      const mtime = (await stat(join(this.dir, file))).mtimeMs;
      if (mtime > newest) newest = mtime;
    }
    return newest;
  }
}
