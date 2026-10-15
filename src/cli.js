// CLI: add, list, show, search, tags, rm.
// Notes live in $NOTES_DIR or ~/.notes; the search index is rebuilt only when
// a note file is newer than the index file.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { NotesStore } from './store.js';
import { InvertedIndex } from './indexer.js';
import { search } from './search.js';

const COMMANDS = {
  add: 'add "title" [--body text|@file|-] [--tags a,b]',
  list: 'list [--tag t]',
  show: 'show <id>',
  search: 'search <query>',
  tags: 'tags',
  rm: 'rm <id>',
};

function usage() {
  return [
    'usage: notes <command> [args]',
    '',
    ...Object.values(COMMANDS).map((c) => `  ${c}`),
    '',
    'Query syntax: terms are ANDed, "exact phrase", -excluded, pref*',
    'Notes dir: $NOTES_DIR or ~/.notes',
  ].join('\n');
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { positional: [], flags: {} };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      args.flags[key] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
    } else {
      args.positional.push(rest[i]);
    }
  }
  return { command, args };
}

function readBody(spec) {
  if (spec === undefined) return '';
  if (spec === '-') return readFileSync(0, 'utf8');
  if (spec.startsWith('@')) return readFileSync(spec.slice(1), 'utf8');
  return spec;
}

async function freshIndex(store) {
  if (!(await InvertedIndex.isFresh(store.indexPath, await store.newestMtime()))) {
    const index = InvertedIndex.build(await store.list());
    await index.save(store.indexPath);
    return index;
  }
  return InvertedIndex.load(store.indexPath);
}

export async function run(argv) {
  const dir = process.env.NOTES_DIR || join(homedir(), '.notes');
  const store = new NotesStore(dir);
  const { command, args } = parseArgs(argv);

  switch (command) {
    case 'add': {
      const [title] = args.positional;
      if (!title) throw new Error('add needs a title\n' + usage());
      const tags = args.flags.tags ? String(args.flags.tags).split(',') : [];
      const note = await store.create({ title, body: readBody(args.flags.body), tags });
      console.log(`created ${note.id}`);
      break;
    }
    case 'list': {
      const notes = args.flags.tag ? await store.findByTag(String(args.flags.tag)) : await store.list();
      for (const note of notes) {
        console.log(`${note.id}  ${note.title}${note.tags.length ? `  [${note.tags.join(', ')}]` : ''}`);
      }
      break;
    }
    case 'show': {
      const [id] = args.positional;
      const note = id ? await store.get(id) : null;
      if (!note) throw new Error(`no note "${id || ''}"`);
      console.log(note.toMarkdown());
      break;
    }
    case 'search': {
      const query = args.positional.join(' ');
      if (!query) throw new Error('search needs a query\n' + usage());
      const index = await freshIndex(store);
      const byId = new Map((await store.list()).map((n) => [n.id, n]));
      const hits = search(index, byId, query);
      for (const { note, score, snippet } of hits) {
        console.log(`${note.id}  ${note.title}  (${score.toFixed(2)})`);
        console.log(`  ${snippet}`);
      }
      if (!hits.length) console.log('no matches');
      break;
    }
    case 'tags': {
      for (const { tag, count } of await store.allTags()) {
        console.log(`${tag} (${count})`);
      }
      break;
    }
    case 'rm': {
      const [id] = args.positional;
      if (!id || !(await store.remove(id))) throw new Error(`no note "${id || ''}"`);
      console.log(`removed ${id}`);
      break;
    }
    default:
      throw new Error((command ? `unknown command "${command}"\n` : '') + usage());
  }
}
