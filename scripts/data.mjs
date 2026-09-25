#!/usr/bin/env node
/**
 * Manages the real-world datasets listed in data/sources.json.
 *
 *   npm run data:status    what is present, what is missing, how big
 *   npm run data:fetch     download every dataset that has a url and is absent
 *   npm run data:fetch -- --force   re-download even if present
 *   npm run data:fetch -- --id=x    just one dataset
 *
 * A dataset can arrive two ways and the tooling does not care which: set a
 * `url` and let this fetch it, or drop the file at the manifest's `file` path
 * yourself. `data:status` reports either.
 */

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const MANIFEST = join(DATA_DIR, 'sources.json');

/* Anything at or above this, committed to git, will make the repo unpleasant
   to clone. GitHub warns at 50 MB and refuses at 100 MB. */
const COMMITTED_SIZE_WARNING = 5 * 1024 * 1024;

const args = process.argv.slice(2);
const command = args.find((a) => !a.startsWith('--')) ?? 'status';
const force = args.includes('--force');
const onlyId = args.find((a) => a.startsWith('--id='))?.slice(5);

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function loadManifest() {
  if (!existsSync(MANIFEST)) {
    console.error(`\n  ✗ No manifest at ${MANIFEST}\n`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch (error) {
    console.error(`\n  ✗ data/sources.json is not valid JSON: ${error.message}\n`);
    process.exit(1);
  }
  if (!Array.isArray(parsed.datasets)) {
    console.error('\n  ✗ data/sources.json needs a "datasets" array.\n');
    process.exit(1);
  }
  return parsed.datasets;
}

/** Keeps a manifest path from escaping data/, whatever it says. */
function resolveTarget(dataset) {
  const target = resolve(DATA_DIR, dataset.file);
  if (!target.startsWith(DATA_DIR + '/')) {
    throw new Error(
      `dataset "${dataset.id}" points outside data/: ${dataset.file}`,
    );
  }
  return target;
}

function status(datasets) {
  console.log('');
  let present = 0;
  let missing = 0;

  for (const dataset of datasets) {
    const target = resolveTarget(dataset);
    const here = existsSync(target);
    const size = here ? statSync(target).size : 0;

    if (here) present += 1;
    else missing += 1;

    const mark = here ? '✓' : '·';
    const where = here
      ? human(size)
      : dataset.url
        ? 'not fetched yet'
        : 'no url, supply the file yourself';

    console.log(`  ${mark} ${dataset.id.padEnd(22)} ${where}`);
    console.log(`    ${dataset.file}`);

    if (here && dataset.kind === 'reference' && size > COMMITTED_SIZE_WARNING) {
      console.log(
        `    ! ${human(size)} is large for a file committed to git.` +
          ` Consider trimming it, or moving it to raw/.`,
      );
    }
    console.log('');
  }

  console.log(`  ${present} present, ${missing} missing.\n`);

  const fetchable = datasets.filter(
    (d) => d.url && !existsSync(resolveTarget(d)),
  ).length;
  if (fetchable > 0) {
    console.log(
      `  ${fetchable} have a url and could be downloaded: npm run data:fetch\n`,
    );
  }
}

async function fetchOne(dataset) {
  const target = resolveTarget(dataset);

  if (!dataset.url) {
    console.log(`  · ${dataset.id} — no url. Put the file at ${dataset.file}.`);
    return 'skipped';
  }
  if (existsSync(target) && !force) {
    console.log(`  ✓ ${dataset.id} — already here. --force to replace.`);
    return 'skipped';
  }

  mkdirSync(dirname(target), { recursive: true });
  process.stdout.write(`  ↓ ${dataset.id} ... `);

  let response;
  try {
    response = await fetch(dataset.url, { redirect: 'follow' });
  } catch (error) {
    console.log('FAILED');
    console.log(`    ${error.message}`);
    return 'failed';
  }

  if (!response.ok) {
    console.log(`FAILED (HTTP ${response.status})`);
    return 'failed';
  }
  if (!response.body) {
    console.log('FAILED (empty response)');
    return 'failed';
  }

  // Stream it. Some of these are hundreds of megabytes and must not be
  // buffered in memory.
  const tmp = `${target}.partial`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tmp));
  } catch (error) {
    console.log('FAILED');
    console.log(`    ${error.message}`);
    return 'failed';
  }

  const { renameSync } = await import('node:fs');
  renameSync(tmp, target);

  const size = statSync(target).size;
  console.log(`done, ${human(size)}`);

  if (dataset.kind === 'reference' && size > COMMITTED_SIZE_WARNING) {
    console.log(
      `    ! ${human(size)} is large for a committed file. Trim it or set` +
        ` kind to "raw".`,
    );
  }
  return 'fetched';
}

async function main() {
  let datasets = loadManifest();

  if (onlyId) {
    datasets = datasets.filter((d) => d.id === onlyId);
    if (datasets.length === 0) {
      console.error(`\n  ✗ No dataset with id "${onlyId}" in the manifest.\n`);
      process.exit(1);
    }
  }

  if (command === 'status') {
    status(datasets);
    return;
  }

  if (command === 'fetch') {
    console.log('');
    const results = [];
    for (const dataset of datasets) results.push(await fetchOne(dataset));
    const failed = results.filter((r) => r === 'failed').length;
    const fetched = results.filter((r) => r === 'fetched').length;
    console.log(`\n  ${fetched} fetched, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
    return;
  }

  console.error(`\n  ✗ Unknown command "${command}". Use status or fetch.\n`);
  process.exit(1);
}

main().catch((error) => {
  console.error(`\n  ✗ ${error.message}\n`);
  process.exit(1);
});
