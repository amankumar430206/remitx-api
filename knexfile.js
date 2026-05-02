import { config } from './src/config/index.js';

export default {
  development: {
    client: 'pg',
    connection: config.postgresUrl,
    migrations: {
      directory: './db/migrations',
      extension: 'js',
    },
    seeds: {
      directory: './db/seeds',
    },
  },
  test: {
    client: 'pg',
    connection: process.env.POSTGRES_URL || 'postgresql://remitx:remitx_dev@localhost:5432/remitx_test',
    migrations: {
      directory: './db/migrations',
      extension: 'js',
    },
    seeds: {
      directory: './db/seeds',
    },
  },
  production: {
    client: 'pg',
    connection: config.postgresUrl,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: './db/migrations',
      extension: 'js',
    },
  },
};
