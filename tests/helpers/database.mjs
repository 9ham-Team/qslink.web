import crypto from 'node:crypto';
import { Pool } from 'pg';
import { Database } from '../../server/lib/db.js';

export async function fixture() {
  // Never use DATABASE_URL: that may be a real development/production database.
  const databaseUrl = process.env.QSL_TEST_DATABASE_URL;
  if (!databaseUrl)
    throw new Error('Run tests through npm test / npm run test:production');
  const databaseSchema =
    'qslink_test_' + crypto.randomBytes(12).toString('hex');
  const config = { databaseUrl, databaseSchema };
  const db = new Database(config);
  await db.migrate();
  return {
    ...config,
    db,
    async cleanup() {
      await db.close();
      if (!/^qslink_test_[a-f0-9]{24}$/.test(databaseSchema))
        throw new Error('Refusing unsafe test cleanup');
      const pool = new Pool({ connectionString: databaseUrl });
      try {
        await pool.query(`DROP SCHEMA "${databaseSchema}" CASCADE`);
      } finally {
        await pool.end();
      }
    },
  };
}
