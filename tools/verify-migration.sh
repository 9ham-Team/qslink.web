#!/bin/sh
# Exercise only synthetic data in two isolated Docker Compose projects.
set -eu
bundle=${1:?Usage: sh tools/verify-migration.sh /absolute/bundle-directory}
case "$bundle" in /*) ;; *) echo 'Use an absolute bundle path'; exit 1;; esac
qa_dir=$(mktemp -d /tmp/qslink-migration-qa-XXXXXXXX)
stamp=$(basename "$qa_dir" | tr 'A-Z' 'a-z')
source_project="$stamp-source"
target_project="$stamp-target"
cat > "$qa_dir/compose.qa.yaml" <<'YAML'
services:
  proxy:
    ports: !reset []
YAML
export COMPOSE_FILE="$bundle/compose.yaml:$qa_dir/compose.qa.yaml"
export QSL_DOMAIN=localhost
export POSTGRES_PASSWORD=isolated-qa-postgres-password
export QSL_DB_PASSWORD=isolated-qa-app-password
cleanup() {
  docker compose -p "$source_project" down --volumes >/dev/null 2>&1 || true
  docker compose -p "$target_project" down --volumes >/dev/null 2>&1 || true
}
trap cleanup EXIT
export COMPOSE_PROJECT_NAME="$source_project"
docker compose config --quiet
docker compose up -d --wait db
printf '%s' '{"username":"migration_qa","email":"migration@example.test","password":"Migration-QA-42!"}' | docker compose run --rm -T --no-deps app node server/init-admin.js
docker compose up -d --wait
docker compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt | docker compose exec -T app node -e "require('https').get({hostname:'proxy',servername:'localhost',path:'/api/health',headers:{host:'localhost'},ca:require('fs').readFileSync(0)},r=>{if(r.statusCode!==200)process.exitCode=1;console.log('Verified HTTPS proxy:',r.statusCode);r.resume()}).on('error',e=>{console.error(e);process.exitCode=1})"
docker compose exec -T app sh -ec 'mkdir -p /var/lib/qslink/uploads; printf migration-fixture > /var/lib/qslink/uploads/migration-qa.txt'
docker compose exec -T app node -e "require('http').get('http://proxy',{headers:{host:'localhost'}},r=>{console.log('Redirect:',r.statusCode,r.headers.location);if(r.statusCode!==308||r.headers.location!=='https://localhost/'){process.exitCode=1}else console.log('HTTP to HTTPS redirect OK');r.resume()}).on('error',e=>{console.error(e);process.exitCode=1})"
sh "$bundle/export-data.sh" "$qa_dir/backup"
export COMPOSE_PROJECT_NAME="$target_project"
sh "$bundle/restore-data.sh" "$qa_dir/backup"
docker compose up -d --wait app
docker compose exec -T app node -e "Promise.all([fetch('http://127.0.0.1:8787/api/health').then(async r=>{if(!r.ok)throw Error('health failed');console.log(await r.text())}),fetch('http://127.0.0.1:8787/api/config').then(r=>r.json()).then(c=>{if(c.demo||c.demoAccounts.length)throw Error('demo enabled')}),fetch('http://127.0.0.1:8787/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://localhost'},body:JSON.stringify({identifier:'migration_qa',password:'Migration-QA-42!'})}).then(async r=>{if(!r.ok)throw Error('restored login failed '+r.status);console.log('Restored account login OK')}),require('fs/promises').readFile('/var/lib/qslink/uploads/migration-qa.txt','utf8').then(t=>{if(t!=='migration-fixture')throw Error('upload not restored');console.log('Restored uploads OK')})]).catch(e=>{console.error(e);process.exit(1)})"
docker compose stop app
if sh "$bundle/restore-data.sh" "$qa_dir/backup"; then
  echo 'ERROR: restore unexpectedly accepted a populated database'; exit 1
fi
echo 'PASS: three-container startup, HTTP redirect, database/uploads round trip, restored login, demo isolation, overwrite refusal'
