// Note: the core domain object. Notes are stored as plain markdown files with
// a small front-matter header, so they stay readable in any editor.

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export class Note {
  constructor({ id, title, body = '', tags = [], createdAt = new Date(), updatedAt = new Date() }) {
    if (!id) throw new Error('note id is required');
    if (!title || !title.trim()) throw new Error('note title is required');
    this.id = id;
    this.title = title.trim();
    this.body = body;
    this.tags = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))];
    this.createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    this.updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  }

  static newId(title) {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'note';
    return `${slug}-${Date.now().toString(36)}`;
  }

  /** All text the search index consumes. */
  get text() {
    return `${this.title}\n${this.body}\n${this.tags.join(' ')}`;
  }

  toMarkdown() {
    const tags = this.tags.length ? `tags: [${this.tags.join(', ')}]` : 'tags: []';
    return [
      '---',
      `title: ${this.title}`,
      tags,
      `created: ${this.createdAt.toISOString()}`,
      `updated: ${this.updatedAt.toISOString()}`,
      '---',
      '',
      this.body,
      '',
    ].join('\n');
  }

  static parse(id, raw) {
    const match = FRONT_MATTER_RE.exec(raw);
    if (!match) throw new Error(`note "${id}" has no front-matter header`);
    const header = Object.fromEntries(
      match[1]
        .split('\n')
        .map((line) => line.split(/:(.+)/))
        .filter((parts) => parts.length === 3)
        .map(([key, value]) => [key.trim(), value.trim()])
    );
    if (!header.title) throw new Error(`note "${id}" is missing a title`);
    const tags = (header.tags || '')
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    return new Note({
      id,
      title: header.title,
      body: match[2].trimEnd(),
      tags,
      createdAt: header.created ? new Date(header.created) : new Date(),
      updatedAt: header.updated ? new Date(header.updated) : new Date(),
    });
  }
}
