#!/bin/sh
set -e
# Fresh PostgreSQL volume only. Runtime uses a non-superuser role.
psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password QSL_DB_PASSWORD
CREATE ROLE qslink LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE qslink OWNER qslink;
SQL
