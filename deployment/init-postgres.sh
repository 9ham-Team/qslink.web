#!/bin/sh
set -e
# 仅在全新数据库卷首次启动时创建非超级用户及应用数据库。
psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password QSL_DB_PASSWORD
CREATE ROLE qslink LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE DATABASE qslink OWNER qslink;
SQL
