import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const storageRoot = mkdtempSync(path.join(tmpdir(), 'chordmini-e2e-'));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3310' },
  projects: [
    { name: 'desktop', testIgnore: /mobile-.*\.spec\.ts/ },
    {
      name: 'mobile',
      testMatch: /mobile-.*\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
  ],
  // E2E_BASE_URL points at an app that is already running, such as the Docker stack.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    // E2E targets the production bundle so it can run alongside a developer's
    // existing `next dev` process without fighting over Next's dev lock.
    command: 'node .next/standalone/server.js',
    cwd: path.resolve(__dirname, '..'),
    url: 'http://127.0.0.1:3310/api/persistence/health',
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 1_000 },
    env: {
      ...process.env,
      SQLITE_DATABASE_PATH: path.join(storageRoot, 'db', 'chordmini.sqlite'),
      LOCAL_AUDIO_STORAGE_DIR: path.join(storageRoot, 'audio'),
      NEXT_PUBLIC_BASE_URL: 'http://127.0.0.1:3310',
      PORT: '3310',
      HOSTNAME: '127.0.0.1',
    },
  },
});
