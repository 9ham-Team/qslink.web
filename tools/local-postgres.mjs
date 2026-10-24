// Development only. Production uses the PostgreSQL service in compose.yaml.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'data');
const credentialsFile = path.join(dir, 'local-postgres.json');
await fs.mkdir(dir, { recursive: true });
let config;
try {
  config = JSON.parse(await fs.readFile(credentialsFile, 'utf8'));
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
  config = { port: 55432, password: crypto.randomBytes(32).toString('hex') };
  await fs.writeFile(credentialsFile, JSON.stringify(config), {
    flag: 'wx',
    mode: 0o600,
  });
}
const databaseDir = path.join(dir, 'postgresql');
const database = new EmbeddedPostgres({
  databaseDir,
  port: config.port,
  user: 'postgres',
  password: config.password,
  authMethod: 'scram-sha-256',
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
try {
  await fs.access(path.join(databaseDir, 'PG_VERSION'));
} catch {
  await database.initialise();
}
await database.start();
// Pool connections select the existing postgres database; schemas isolate dev/test.
console.log(
  '本地 PostgreSQL 已启动：127.0.0.1:' +
    config.port +
    '；凭据保存在忽略的 data/local-postgres.json。',
);
const timer = setInterval(() => {}, 60000);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    clearInterval(timer);
    await database.stop();
    process.exit(0);
  });
