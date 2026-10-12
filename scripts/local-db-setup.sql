-- Local development database for Casa de Anton.
--
-- Run it once, as the Postgres superuser:
--
--   & "E:\PostgresSQL\bin\psql.exe" -U postgres -h localhost -f scripts/local-db-setup.sql
--
-- It is safe to run more than once: both statements check first.
--
-- The password below is LOCAL DEVELOPMENT ONLY. It never reaches production,
-- because the deployed application reads DATABASE_URL from the hosting
-- provider's environment, never from this file.

-- The application connects with its own role instead of `postgres`, so the
-- superuser is never used by the app.
-- The ELSE branch keeps the role's password in sync with .env, so running this
-- script always leaves a working local setup.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'casa_de_anton') THEN
    CREATE ROLE casa_de_anton WITH LOGIN PASSWORD 'casa_de_anton_dev';
  ELSE
    ALTER ROLE casa_de_anton WITH LOGIN PASSWORD 'casa_de_anton_dev';
  END IF;
END
$$;

-- CREATE DATABASE cannot run inside a DO block, so the statement is built
-- conditionally and handed to psql with \gexec.
SELECT 'CREATE DATABASE casa_de_anton OWNER casa_de_anton'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'casa_de_anton')
\gexec
