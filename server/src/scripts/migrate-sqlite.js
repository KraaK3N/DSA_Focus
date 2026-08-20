/**
 * SQLite → PostgreSQL Migration Script
 * 
 * Migrates existing data from the old SQLite database (backend/dsa_problems.db)
 * to the new PostgreSQL database under a specified user account.
 *
 * Usage:
 *   npm run migrate:sqlite
 *
 * Prerequisites:
 *   1. PostgreSQL must be running and migrations applied (npm run migrate)
 *   2. A user account must exist in PostgreSQL (run seed first, or register a user)
 *   3. The SQLite database file must exist at ../../backend/dsa_problems.db
 *
 * Environment:
 *   MIGRATE_USER_EMAIL — email of the user to assign data to (default: admin@dsafocus.dev)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const SQLITE_PATH = path.join(__dirname, '../../../backend/dsa_problems.db');
const TARGET_EMAIL = process.env.MIGRATE_USER_EMAIL || 'admin@dsafocus.dev';

const pgPool = new Pool({ connectionString: process.env.DATABASE_URL });

function openSQLite() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(SQLITE_PATH, sqlite3.OPEN_READONLY, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function sqliteAll(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function migrate() {
  console.log('\n📦 SQLite → PostgreSQL Migration');
  console.log('─'.repeat(50));
  console.log(`  Source: ${SQLITE_PATH}`);
  console.log(`  Target user: ${TARGET_EMAIL}`);
  console.log('');

  // Open SQLite
  const sqliteDb = await openSQLite();
  console.log('  ✓ SQLite database opened');

  // Get target user ID from PostgreSQL
  const { rows: userRows } = await pgPool.query(
    'SELECT id FROM users WHERE email = $1',
    [TARGET_EMAIL]
  );

  if (userRows.length === 0) {
    console.error(`  ✗ User "${TARGET_EMAIL}" not found in PostgreSQL.`);
    console.error('    Run "npm run seed" first, or register a user, then retry.');
    process.exit(1);
  }

  const userId = userRows[0].id;
  console.log(`  ✓ Target user found: ${userId}`);

  // ─── Migrate Problems ─────────────────────────
  const problems = await sqliteAll(sqliteDb, 'SELECT * FROM problems ORDER BY date DESC');
  console.log(`\n  → Migrating ${problems.length} problems...`);

  let problemsInserted = 0;
  for (const p of problems) {
    try {
      await pgPool.query(
        `INSERT INTO problems (id, user_id, date, name, url, platform, difficulty, topic, notes, hint_used, independent, needs_revision, time_spent, time_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING`,
        [
          p.id,
          userId,
          p.date || null,
          p.name || 'Untitled',
          p.url || '',
          p.platform || 'N/A',
          p.difficulty || 'Medium',
          p.topic || 'General',
          p.notes || '',
          p.hintUsed === 1 || p.hint_used === 1 || false,
          p.independent === 1 || false,
          p.needsRevision === 1 || p.needs_revision === 1 || false,
          p.timeSpent || p.time_spent || '0s',
          p.timeSeconds || p.time_seconds || 0,
        ]
      );
      problemsInserted++;
    } catch (err) {
      console.error(`    ✗ Problem "${p.name}" failed: ${err.message}`);
    }
  }
  console.log(`  ✓ ${problemsInserted}/${problems.length} problems migrated`);

  // ─── Migrate Journals ─────────────────────────
  const journals = await sqliteAll(sqliteDb, 'SELECT * FROM journals ORDER BY date DESC');
  console.log(`\n  → Migrating ${journals.length} journals...`);

  let journalsInserted = 0;
  for (const j of journals) {
    try {
      await pgPool.query(
        `INSERT INTO journals (id, user_id, date, timestamp, title, content, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [
          j.id,
          userId,
          j.date || null,
          j.timestamp || Date.now(),
          j.title || '',
          j.content || '',
          j.updatedAt || j.updated_at || Date.now(),
        ]
      );
      journalsInserted++;
    } catch (err) {
      console.error(`    ✗ Journal "${j.title}" failed: ${err.message}`);
    }
  }
  console.log(`  ✓ ${journalsInserted}/${journals.length} journals migrated`);

  // ─── Migrate KV Settings ──────────────────────
  let kvCount = 0;
  try {
    const kvRows = await sqliteAll(sqliteDb, 'SELECT * FROM kv');
    console.log(`\n  → Migrating ${kvRows.length} settings...`);

    for (const kv of kvRows) {
      await pgPool.query(
        `INSERT INTO user_settings (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = $3`,
        [userId, kv.key, kv.value]
      );
      kvCount++;
    }
    console.log(`  ✓ ${kvCount} settings migrated`);
  } catch {
    console.log('  ⚠ No kv table found (skipping settings)');
  }

  // ─── Summary ──────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log('  Migration Summary:');
  console.log(`    Problems: ${problemsInserted}`);
  console.log(`    Journals: ${journalsInserted}`);
  console.log(`    Settings: ${kvCount}`);
  console.log(`    User:     ${TARGET_EMAIL} (${userId})`);
  console.log('─'.repeat(50));

  // Verify counts match
  const { rows: pgProblems } = await pgPool.query(
    'SELECT COUNT(*) FROM problems WHERE user_id = $1',
    [userId]
  );
  const { rows: pgJournals } = await pgPool.query(
    'SELECT COUNT(*) FROM journals WHERE user_id = $1',
    [userId]
  );

  console.log(`\n  Verification:`);
  console.log(`    SQLite problems: ${problems.length} → PostgreSQL: ${pgProblems[0].count}`);
  console.log(`    SQLite journals: ${journals.length} → PostgreSQL: ${pgJournals[0].count}`);

  // Cleanup
  sqliteDb.close();
  await pgPool.end();
}

migrate()
  .then(() => {
    console.log('\n✅ Migration complete!\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  });
