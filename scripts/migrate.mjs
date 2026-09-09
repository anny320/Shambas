#!/usr/bin/env node
/**
 * Applies the SQL migrations in supabase/migrations to a Postgres database.
 *
 * This exists so setting up a project is one command rather than pasting SQL
 * into a dashboard in the right order and hoping. It runs on YOUR machine with
 * YOUR connection string, so the database password never leaves it.
 *
 *   npm run db:migrate     apply anything not yet applied
 *   npm run db:status      show what has and has not been applied
 *
 * The connection string comes from SUPABASE_DB_URL, in .env.local or the
 * environment. Get it from the Supabase dashboard under
 * Project Settings -> Database -> Connection string. Use the direct connection
 * or the session pooler, NOT the transaction pooler: the transaction pooler
 * does not support the statements these migrations need.
 *
 * Safe to re-run. Applied migrations are recorded in a shamba_migrations
 * table, and each file runs inside its own transaction, so a failure rolls
 * that file back completely rather than leaving the schema half-built.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

const statusOnly = process.argv.includes('--status');

/** Minimal .env.local reader. No dependency, and it never logs a value. */
function loadEnvLocal() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return;

  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Real environment variables win over the file.
    if (!(key in process.env)) process.env[key] = value;
  }
}

function fail(message, hint) {
  console.error(`\n  ✗ ${message}`);
  if (hint) console.error(`\n    ${hint}`);
  console.error('');
  process.exit(1);
}

function migrationFiles() {
  if (!existsSync(MIGRATIONS_DIR)) {
    fail(`No migrations directory at ${MIGRATIONS_DIR}`);
  }
  // Filename order is the apply order, which is why they are timestamped.
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex').slice(0, 16);
}

async function main() {
  loadEnvLocal();

  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    fail(
      'SUPABASE_DB_URL is not set.',
      'Add it to .env.local. Supabase dashboard -> Project Settings ->\n' +
        '    Database -> Connection string. Use the direct connection or the\n' +
        '    session pooler, not the transaction pooler.',
    );
  }

  const files = migrationFiles();
  if (files.length === 0) fail('No .sql files in supabase/migrations.');

  const client = new pg.Client({
    connectionString,
    // Supabase terminates TLS with its own chain; verifying it here would need
    // the CA bundle shipped alongside. The connection is still encrypted.
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (error) {
    fail(
      `Could not connect: ${error.message}`,
      'Check the password in SUPABASE_DB_URL, and that you used the direct\n' +
        '    connection or session pooler string rather than the transaction pooler.',
    );
  }

  const { rows: dbInfo } = await client.query(
    'select current_database() as db, current_user as user',
  );
  console.log(
    `\n  Connected to ${dbInfo[0].db} as ${dbInfo[0].user}\n`,
  );

  await client.query(`
    create table if not exists public.shamba_migrations (
      filename    text primary key,
      checksum    text not null,
      applied_at  timestamptz not null default now()
    )
  `);

  const { rows: appliedRows } = await client.query(
    'select filename, checksum from public.shamba_migrations',
  );
  const applied = new Map(appliedRows.map((r) => [r.filename, r.checksum]));

  let pending = 0;
  let changed = 0;
  let drifted = 0;

  for (const filename of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
    const sum = checksum(sql);
    const previous = applied.get(filename);

    if (previous === undefined) {
      pending += 1;
      if (statusOnly) {
        console.log(`  pending   ${filename}`);
        continue;
      }

      process.stdout.write(`  applying  ${filename} ... `);
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query(
          'insert into public.shamba_migrations (filename, checksum) values ($1, $2)',
          [filename, sum],
        );
        await client.query('commit');
        console.log('done');
        changed += 1;
      } catch (error) {
        await client.query('rollback');
        console.log('FAILED');
        await client.end();
        fail(
          `${filename} failed and was rolled back: ${error.message}`,
          'Nothing from this file was applied. Fix the cause and re-run;\n' +
            '    migrations already applied are skipped.',
        );
      }
    } else if (previous !== sum) {
      // The file changed after it was applied. Editing an applied migration
      // means two databases can silently diverge, so say so rather than
      // guessing which version is real.
      drifted += 1;
      console.log(`  CHANGED   ${filename}`);
      console.log(
        `            applied as ${previous}, file is now ${sum}.\n` +
          `            Add a new migration instead of editing an applied one.`,
      );
    } else {
      console.log(`  applied   ${filename}`);
    }
  }

  await client.end();

  console.log('');

  /*
   * Drift is not "up to date". A migration whose file no longer matches what
   * was applied means this database and a fresh one built from the same files
   * would differ, so it exits non-zero rather than reporting success.
   */
  if (drifted > 0) {
    console.log(
      `  ${drifted} applied migration${drifted === 1 ? '' : 's'} ` +
        `no longer match${drifted === 1 ? 'es' : ''} the file on disk.\n` +
        '  This database and a fresh one built from these files would differ.\n',
    );
    process.exit(1);
  }

  if (statusOnly) {
    console.log(
      pending === 0
        ? '  Up to date.\n'
        : `  ${pending} migration${pending === 1 ? '' : 's'} pending. Run: npm run db:migrate\n`,
    );
  } else if (changed === 0) {
    console.log('  Already up to date.\n');
  } else {
    console.log(
      `  Applied ${changed} migration${changed === 1 ? '' : 's'}.\n\n` +
        '  Next: switch OFF Authentication -> Providers -> Email -> Confirm email\n' +
        '  in the Supabase dashboard, then run npm run dev.\n',
    );
  }
}

main().catch((error) => {
  console.error(`\n  ✗ Unexpected failure: ${error.message}\n`);
  process.exit(1);
});
