#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Runs the Row Level Security isolation test against a throwaway Postgres.
#
#   ./supabase/tests/run.sh
#
# Needs a reachable Postgres superuser connection. Point PGHOST/PGPORT/PGUSER
# at one, or let it use your local defaults. The database named by TEST_DB is
# dropped and recreated on every run, so do not aim this at anything you care
# about.
# ---------------------------------------------------------------------------
set -euo pipefail

TEST_DB="${TEST_DB:-shamba_rls_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

psql -v ON_ERROR_STOP=1 -q -d postgres \
  -c "drop database if exists ${TEST_DB}" \
  -c "create database ${TEST_DB}"

psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$HERE/00_local_auth_shim.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$migration"
done

psql -v ON_ERROR_STOP=1 -q -d "$TEST_DB" -f "$HERE/01_rls_isolation_test.sql"

echo "RLS isolation test passed."
