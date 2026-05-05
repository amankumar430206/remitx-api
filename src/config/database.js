import pg from 'pg';
import knex from 'knex';
import { config } from './index.js';

// Keep DATE columns as 'YYYY-MM-DD' strings — avoid local-timezone Date conversion
pg.types.setTypeParser(1082, (val) => val);

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
