'use strict';
const { badRequest } = require('./errors');
const FIELDS = ['callSign', 'stationCallSign', 'qsoAt', 'band', 'mode', 'submode', 'frequency',
  'rstSent', 'rstReceived', 'name', 'country', 'grid', 'propagation', 'satellite', 'source', 'lotwConfirmed'];

// Only ownership is checked; callsigns, dates and modes are the user's choice.
function snapshotSelectedLogs(db, userId, ids) {
  const owned = new Map(db.data.contactLogs.filter(row => row.userId === userId).map(row => [row.id, row]));
  return ids.map(id => {
    const row = owned.get(id);
    if (!row) throw badRequest({ contactLogIds: '所选通联记录不存在或不属于你，请重新选择' });
    return { id, ...Object.fromEntries(FIELDS.filter(key => Object.hasOwn(row.details, key)).map(key => [key, row.details[key]])) };
  });
}
module.exports = { snapshotSelectedLogs };
