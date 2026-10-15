// InvertedIndex: on-disk full-text index over the notes corpus.
// Posting lists record term positions, which enables exact phrase matching.
// The index is persisted as JSON and rebuilt only when a note file is newer
// than the index file, so search stays fast on large collections.

import { readFile, writeFile, stat } from 'node:fs/promises';

const STOP_WORDS = new Set(
  'a,an,and,are,as,at,be,but,by,for,from,has,he,in,is,it,its,of,on,that,the,to,was,were,will,with'.split(',')
);

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]{2,}/g) || []).filter((t) => !STOP_WORDS.has(t));
}

export class InvertedIndex {
  constructor() {
    this.terms = new Map(); // term -> Map(docId -> number[] positions)
    this.docs = new Map(); // docId -> { length, title }
    this.builtAt = null;
  }

  get size() {
    return this.docs.size;
  }

  static build(notes) {
    const index = new InvertedIndex();
    for (const note of notes) {
      const tokens = tokenize(note.text);
      const postings = new Map();
      tokens.forEach((term, pos) => {
        if (!postings.has(term)) postings.set(term, []);
        postings.get(term).push(pos);
      });
      for (const [term, positions] of postings) {
        if (!index.terms.has(term)) index.terms.set(term, new Map());
        index.terms.get(term).set(note.id, positions);
      }
      index.docs.set(note.id, { length: tokens.length, title: note.title });
    }
    index.builtAt = Date.now();
    return index;
  }

  /** True when the index exists and is newer than every note file. */
  static async isFresh(indexPath, newestNoteMtime) {
    try {
      const { mtimeMs } = await stat(indexPath);
      return mtimeMs >= newestNoteMtime && newestNoteMtime > 0;
    } catch {
      return false;
    }
  }

  static async load(indexPath) {
    const raw = JSON.parse(await readFile(indexPath, 'utf8'));
    const index = new InvertedIndex();
    for (const [term, postings] of Object.entries(raw.terms)) {
      index.terms.set(term, new Map(Object.entries(postings)));
    }
    index.docs = new Map(Object.entries(raw.docs));
    index.builtAt = raw.builtAt;
    return index;
  }

  async save(indexPath) {
    const raw = {
      terms: Object.fromEntries([...this.terms].map(([t, m]) => [t, Object.fromEntries(m)])),
      docs: Object.fromEntries(this.docs),
      builtAt: this.builtAt,
    };
    await writeFile(indexPath, JSON.stringify(raw), 'utf8');
  }

  /** Positions of `term` in `docId`, or null when absent. */
  positions(term, docId) {
    return this.terms.get(term)?.get(docId) ?? null;
  }

  /** Expand a prefix (e.g. "prog") into the indexed terms it matches. */
  expandPrefix(prefix) {
    const out = [];
    for (const term of this.terms.keys()) {
      if (term.startsWith(prefix) && term !== prefix) out.push(term);
    }
    return out;
  }

  idf(term) {
    const df = this.terms.get(term)?.size ?? 0;
    return df === 0 ? 0 : Math.log(1 + this.docs.size / df);
  }
}
