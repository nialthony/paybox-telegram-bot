import dotenv from 'dotenv';
import { PostgresPaymentIntentStore } from '../src/services/postgres-payment-intents.js';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const store = PostgresPaymentIntentStore.fromConnectionString({ connectionString });
try {
  await store.initialize();
  console.log('Payment-intent database schema is ready.');
} finally {
  await store.close();
}
