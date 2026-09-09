# Database tests

`01_rls_isolation_test.sql` is the proof that multi-tenancy holds. It stands up
two institutions and three users, then asserts everything one tenant *cannot*
do to another: read its farmers or applications by direct id, insert rows into
it, attach an application to its farmer, forge `created_by`, update or delete
its rows, or move its own row across the boundary. It also checks that recorded
decisions are append-only, that consent is required and timestamped, that an
approval must state an amount and a term, that an officer cannot mint invites,
and that a caller with no identity sees nothing at all.

## Running it

The test needs a Postgres superuser connection. It drops and recreates the
database named by `TEST_DB`, so do not point it at anything you care about.

```bash
# against a local Postgres
./supabase/tests/run.sh

# or against a specific cluster
PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run.sh
```

The script applies `00_local_auth_shim.sql`, then every migration in order,
then the assertions. Any failure aborts with a non-zero exit status.

## About the shim

`00_local_auth_shim.sql` recreates only the parts of Supabase the migrations
lean on: the `auth` schema, `auth.users`, `auth.uid()`, and the `anon`,
`authenticated` and `service_role` roles. Supabase provides all of it already,
so **never apply the shim to a Supabase project**. It exists purely so the
policies can be exercised against a real Postgres offline.

Impersonation works the way Supabase's does. `auth.uid()` reads the subject
out of the `request.jwt.claims` setting, so a test logs in by setting that
value and switching to the `authenticated` role.
