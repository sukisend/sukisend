import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sqlPath = resolve(rootDir, 'supabase/upgrade_empty_category_loop.sql');

function loadEnvFile() {
  try {
    const envText = readFileSync(resolve(rootDir, '.env'), 'utf8');
    for (const line of envText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const separator = trimmed.indexOf('=');
      if (separator <= 0) {
        continue;
      }
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local .env
  }
}

async function runWithDatabaseUrl(databaseUrl) {
  const pgModule = await import('pg');
  const { Client } = pgModule.default ?? pgModule;
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const sql = readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    const { rows } = await client.query(
      `select action, category_id, details, created_at
       from public.category_automation_log
       order by created_at desc
       limit 3`,
    );
    console.log('Empty category automation installed.');
    console.log('Latest log entries:', rows);
  } finally {
    await client.end();
  }
}

async function runWithServiceRole(url, serviceRoleKey) {
  const response = await fetch(`${url}/rest/v1/rpc/toggle_empty_category_loop`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `RPC toggle_empty_category_loop failed (${response.status}): ${body}. Run supabase/upgrade_empty_category_loop.sql in SQL Editor first.`,
    );
  }

  const logResponse = await fetch(
    `${url}/rest/v1/category_automation_log?select=action,category_id,details,created_at&order=created_at.desc&limit=3`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );

  const logs = logResponse.ok ? await logResponse.json() : [];
  console.log('Triggered empty category automation via RPC.');
  console.log('Latest log entries:', logs);
}

loadEnvFile();

const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

try {
  if (databaseUrl) {
    await runWithDatabaseUrl(databaseUrl);
    process.exit(0);
  }

  if (supabaseUrl && serviceRoleKey) {
    await runWithServiceRole(supabaseUrl, serviceRoleKey);
    process.exit(0);
  }

  console.error(
    [
      'Could not deploy automation automatically.',
      'Add one of these to .env, then rerun:',
      '  SUPABASE_DB_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres',
      '  SUPABASE_SERVICE_ROLE_KEY=<service-role-key> (after running SQL once in Supabase SQL Editor)',
      '',
      'Manual fallback: open Supabase SQL Editor and run:',
      '  supabase/upgrade_empty_category_loop.sql',
    ].join('\n'),
  );
  process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}