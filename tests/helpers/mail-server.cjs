'use strict';

require('../../server/server').start({
  mailTransport: async (email, code) => {
    process.send({ email, code });
  },
}).catch(() => process.exit(1));
