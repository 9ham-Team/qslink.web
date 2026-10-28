'use strict';

require('../../server/server').start({
  mailTransport: async (email, code) => {
    process.send({ email, code });
  },
  cardReviewMailTransport: async (email, notification) => {
    const { Database } = require('../../server/lib/db');
    const db = new Database({ databaseUrl: process.env.DATABASE_URL, databaseSchema: process.env.QSL_DB_SCHEMA || 'public' });
    try {
      const committed = await db.transaction(unit => !!unit.find('cards', card => card.id === notification.cardId && card.status === 'approved'), { write: true });
      if (!committed) throw new Error('Notification ran before commit');
      process.send({ kind: 'cardReviewMail', email, notification, committed });
      if (process.env.QSL_TEST_FAIL_CARD_REVIEW_MAIL === 'true') throw new Error('provider-secret-do-not-expose');
    } finally { await db.close(); }
  },
  exchangeMailTransport: async (email, notification) => {
    // Verify mail runs after COMMIT and does not hold the write lock.
    const { Database } = require('../../server/lib/db');
    const db = new Database({ databaseUrl: process.env.DATABASE_URL, databaseSchema: process.env.QSL_DB_SCHEMA || 'public' });
    try {
      const committed = await db.transaction(unit => !!unit.find('exchanges', row => row.id === notification.exchangeId &&
        (!notification.status || row.status === notification.status)), { write: true });
      if (!committed) throw new Error('Notification ran before commit');
      process.send({ kind: 'exchangeMail', email, notification, committed });
      if (process.env.QSL_TEST_FAIL_EXCHANGE_MAIL === 'true') throw new Error('provider-secret-do-not-expose');
    } finally { await db.close(); }
  },
}).catch(() => process.exit(1));
