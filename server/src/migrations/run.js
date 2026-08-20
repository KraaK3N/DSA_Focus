/**
 * Migration runner — executes SQL migration files in order.
 * Tracks applied migrations in a `migrations` table.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MIGRATIONS_DIR = __dirname;

async function run() {
  const client = await pool.connect();

  try {
    // Create migrations tracking table first
    const initSQL = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '000_create_migrations_table.sql'),
      'utf8'
    );
    await client.query(initSQL);

    // Get already applied migrations
    const { rows: applied } = await client.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Get all migration files (sorted)
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && f !== '000_create_migrations_table.sql')
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`  ✓ ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`  → Applying ${file}...`);

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`  ✓ ${file} applied`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ ${file} FAILED:`, err.message);
        throw err;
      }
    }

    if (count === 0) {
      console.log('\n  All migrations already applied.');
    } else {
      console.log(`\n  ${count} migration(s) applied successfully.`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('\n🗄️  Running migrations...\n');
run()
  .then(() => {
    console.log('\n✅ Migration complete.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  });
