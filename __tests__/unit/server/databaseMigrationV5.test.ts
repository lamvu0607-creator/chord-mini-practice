import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

jest.mock('server-only', () => ({}), { virtual: true });

describe('database migration to v5', () => {
  let root: string;
  let databasePath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chordmini-migration-'));
    await mkdir(path.join(root, 'db'));
    databasePath = path.join(root, 'db', 'test.sqlite');
    process.env.SQLITE_DATABASE_PATH = databasePath;
    jest.resetModules();
  });

  afterEach(async () => {
    const { closeDatabaseForTests } = await import('@/server/persistence/database');
    closeDatabaseForTests();
    await rm(root, { recursive: true, force: true });
  });

  function expectV5(sqlite: BetterSqlite3.Database) {
    const versions = (sqlite.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>)
      .map((row) => row.version);
    expect(versions).toEqual(expect.arrayContaining([4, 5]));
    const columns = (sqlite.prepare('PRAGMA table_info(audio_files)').all() as Array<{ name: string }>).map((column) => column.name);
    expect(columns).toContain('owner_user_id');
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name='saved_songs'").get()).toBeTruthy();
  }

  it('builds a fresh database', async () => {
    const { getDatabase } = await import('@/server/persistence/database');
    expectV5(getDatabase().sqlite);
  });

  it('upgrades a v4 database, keeps its audio rows and survives a restart', async () => {
    const first = await import('@/server/persistence/database');
    first.getDatabase().sqlite.exec(`
      DROP TABLE saved_songs;
      ALTER TABLE audio_files DROP COLUMN owner_user_id;
      DELETE FROM schema_migrations WHERE version = 5;
      INSERT INTO audio_files(video_id, filename, file_size, created_at_ms, last_accessed_at_ms, state)
        VALUES ('upload_abcdef0123456789abcdef01', 'a.wav', 1, 1, 1, 'active');
    `);
    first.closeDatabaseForTests();

    jest.resetModules();
    const second = await import('@/server/persistence/database');
    const { sqlite } = second.getDatabase();
    expectV5(sqlite);
    expect(sqlite.prepare('SELECT owner_user_id FROM audio_files').get()).toEqual({ owner_user_id: null });
    second.closeDatabaseForTests();

    jest.resetModules();
    const third = await import('@/server/persistence/database');
    expectV5(third.getDatabase().sqlite);
  });
});
