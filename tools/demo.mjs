// Do not override NODE_ENV: production must reject demo mode.
process.env.QSL_SEED_DEMO = 'true';
await import('./start.mjs');
