# js-markdown-notes

A command-line notes app where every note is a plain markdown file, backed by a
real inverted index for full-text search. No database, no dependencies, no
lock-in: your notes stay readable in any editor, and search stays fast because
the index is built once and rebuilt only when your notes change.

## Why this exists

Most note CLIs either grep through files on every search (slow on large
collections) or drag in a database (overkill for personal notes). This project
sits in the middle: an **on-disk inverted index with positional posting lists**,
so phrase queries and prefix wildcards work, ranked with TF-IDF.

## Key design decisions

1. **Files are the database.** Each note is one `<id>.md` file with a small
   front-matter header (title, tags, timestamps). Updates are written atomically
   (write temp file, then rename). Nothing proprietary to migrate away from.
2. **The index is a cache, not a source of truth.** `InvertedIndex` persists as
   JSON and is considered fresh only when it is newer than every note file
   (`NotesStore.newestMtime()`). Searches never scan the corpus; they walk
   posting lists.
3. **Positional postings enable phrase search.** Each term maps to
   `docId -> [positions]`, so `"exact phrase"` queries check for consecutive
   positions. Prefix wildcards (`prog*`) expand against the term dictionary.
4. **Zero dependencies.** Only Node's standard library (`node:fs`,
   `node:test`, ...), so `npm test` works straight after cloning.

## Install & run

Requires Node.js 18+.

```bash
git clone https://github.com/Subhanmalik138/js-markdown-notes.git
cd js-markdown-notes
chmod +x bin/notes        # if needed
./bin/notes add "Deploy checklist" --body "Verify migrations first" --tags ops,deploy
```

Notes live in `~/.notes` by default; point `NOTES_DIR` elsewhere to change it.

## Commands

| Command | Example |
|---|---|
| `add "title" [--body text\|@file\|-] [--tags a,b]` | `./bin/notes add "Books" --body @list.txt --tags reading` |
| `list [--tag t]` | `./bin/notes list --tag ops` |
| `show <id>` | `./bin/notes show deploy-checklist-mv9lvseh` |
| `search <query>` | `./bin/notes search '"previous image" -rollback'` |
| `tags` | `./bin/notes tags` |
| `rm <id>` | `./bin/notes rm deploy-checklist-mv9lvseh` |

### Query syntax

- Terms are ANDed: `backup strategy` matches notes containing both.
- `"exact phrase"` matches consecutive terms.
- `-term` excludes notes containing the term.
- `pref*` matches any indexed term starting with `pref`.
- Stop words (`the`, `and`, ...) are ignored; titles, bodies and tags are all searched.

Results are ranked by TF-IDF with a small length normalization, and each hit
shows a snippet with the matched terms in **bold**.

## Run the tests

```bash
npm test
```

28 tests across `tests/` (note parsing, store CRUD, index persistence, search
ranking, CLI end-to-end), using Node's built-in test runner.

## Project structure

```
bin/notes        executable entry point
src/
  note.js        domain model + markdown front-matter parsing
  store.js       file-backed CRUD, tags, index-freshness bookkeeping
  indexer.js     tokenizer, positional inverted index, JSON persistence
  search.js      query parser, TF-IDF ranking, snippet generation
  cli.js         command parsing and output formatting
tests/           node:test suites, one per module
```

## Tech stack

JavaScript (ES modules), Node.js standard library only.

## License

MIT — see [LICENSE](LICENSE).
