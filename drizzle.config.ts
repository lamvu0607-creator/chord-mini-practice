import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/persistence/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.SQLITE_DATABASE_PATH || './storage/db/chordmini.sqlite',
  },
  strict: true,
});
