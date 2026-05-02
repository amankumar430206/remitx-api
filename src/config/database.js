import knex from 'knex';
import { config } from './index.js';

const db = knex({
  client: 'pg',
  connection: config.postgresUrl,
  pool: {
    min: 2,
    max: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },
  migrations: {
    directory: './db/migrations',
    extension: 'js',
  },
});

export default db;
