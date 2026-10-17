import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set – using default local connection');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/resqnet',
  ssl: process.env.DATABASE_URL && (
    process.env.DATABASE_URL.includes('railway.app') ||
    process.env.DATABASE_URL.includes('railway.internal') ||
    process.env.NODE_ENV === 'production'
  )
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PG client', err);
});
