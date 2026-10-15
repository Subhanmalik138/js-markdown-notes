import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'notes');

describe('CLI', () => {
  let env;
  beforeEach(async () => {
    env = { ...process.env, NOTES_DIR: join(await mkdtemp(join(tmpdir(), 'notes-cli-')), 'data') };
  });

  const notes = (args) => run(bin, args, { env }).then((r) => r.stdout);

  it('adds, lists, searches and removes a note', async () => {
    const added = await notes(['add', 'Deploy checklist', '--body', 'verify migrations first', '--tags', 'ops']);
    const id = added.trim().split(' ')[1];
    assert.match(id, /^deploy-checklist-/);

    const listed = await notes(['list']);
    assert.ok(listed.includes('Deploy checklist'));

    const found = await notes(['search', 'migrations']);
    assert.ok(found.includes('Deploy checklist'));

    await notes(['rm', id]);
    const after = await notes(['list']);
    assert.ok(!after.includes('Deploy checklist'));
  });

  it('shows tags and reports unknown commands', async () => {
    await notes(['add', 'Tagged note', '--tags', 'a,b']);
    const tags = await notes(['tags']);
    assert.ok(tags.includes('a (1)'));

    await assert.rejects(() => notes(['bogus']), /unknown command/);
  });

  it('reads the body from a file with @path', async () => {
    const { writeFile } = await import('node:fs/promises');
    const path = join(env.NOTES_DIR, '..', 'body.txt');
    await writeFile(path, 'body from a file');
    await notes(['add', 'File note', '--body', `@${path}`]);
    const shown = await notes(['show', (await notes(['list'])).trim().split(' ')[0]]);
    assert.ok(shown.includes('body from a file'));
  });
});
