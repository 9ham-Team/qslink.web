'use strict';

const { randomInt } = require('crypto');

// Called under the database write lock; the SQL unique constraint is the final guard.
function createUid(users) {
  const used = new Set(users.map(user => user.uid));
  if (used.size >= 999999999) throw new Error('UID 空间已用尽');
  let uid;
  do { uid = String(randomInt(1, 1000000000)).padStart(9, '0'); } while (used.has(uid));
  return uid;
}

module.exports = { createUid };
