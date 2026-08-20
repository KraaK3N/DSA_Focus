/**
 * Seed script — inserts test data for development.
 * Creates a test admin user and sample problems/journals.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const SAMPLE_PROBLEMS = [
  { name: 'Two Sum', url: 'https://leetcode.com/problems/two-sum/', platform: 'LeetCode', difficulty: 'Easy', topic: 'Arrays', notes: 'Use a hash map for O(n) solution', hint_used: false, independent: true, needs_revision: false, time_spent: '12m', time_seconds: 720 },
  { name: 'Add Two Numbers', url: 'https://leetcode.com/problems/add-two-numbers/', platform: 'LeetCode', difficulty: 'Medium', topic: 'Linked Lists', notes: 'Carry propagation is key', hint_used: false, independent: true, needs_revision: false, time_spent: '25m', time_seconds: 1500 },
  { name: 'Longest Substring Without Repeating Characters', url: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/', platform: 'LeetCode', difficulty: 'Medium', topic: 'Sliding Window', notes: 'Sliding window with a set', hint_used: true, independent: false, needs_revision: true, time_spent: '35m', time_seconds: 2100 },
  { name: 'Merge Two Sorted Lists', url: 'https://leetcode.com/problems/merge-two-sorted-lists/', platform: 'LeetCode', difficulty: 'Easy', topic: 'Linked Lists', notes: 'Iterative approach with dummy head', hint_used: false, independent: true, needs_revision: false, time_spent: '10m', time_seconds: 600 },
  { name: 'Valid Parentheses', url: 'https://leetcode.com/problems/valid-parentheses/', platform: 'LeetCode', difficulty: 'Easy', topic: 'Stacks', notes: 'Stack-based matching', hint_used: false, independent: true, needs_revision: false, time_spent: '8m', time_seconds: 480 },
  { name: 'Binary Tree Level Order Traversal', url: 'https://leetcode.com/problems/binary-tree-level-order-traversal/', platform: 'LeetCode', difficulty: 'Medium', topic: 'Trees', notes: 'BFS with queue', hint_used: false, independent: true, needs_revision: true, time_spent: '20m', time_seconds: 1200 },
  { name: 'Course Schedule', url: 'https://leetcode.com/problems/course-schedule/', platform: 'LeetCode', difficulty: 'Medium', topic: 'Graphs', notes: 'Topological sort with DFS cycle detection', hint_used: true, independent: false, needs_revision: true, time_spent: '45m', time_seconds: 2700 },
  { name: 'Climbing Stairs', url: 'https://leetcode.com/problems/climbing-stairs/', platform: 'LeetCode', difficulty: 'Easy', topic: 'Dynamic Programming', notes: 'Fibonacci pattern', hint_used: false, independent: true, needs_revision: false, time_spent: '5m', time_seconds: 300 },
];

const SAMPLE_JOURNALS = [
  { title: 'Started DSA journey', content: 'Today I decided to commit to solving at least 2 problems daily. Starting with easy array problems to build confidence.' },
  { title: 'Sliding window breakthrough', content: 'Finally understood the sliding window pattern! The key insight is maintaining a window of valid elements and expanding/shrinking as needed.' },
  { title: 'Graph algorithms are tough', content: 'Spent 2 hours on Course Schedule. Topological sort makes sense conceptually but implementing cycle detection with DFS coloring took a while.' },
];

async function seed() {
  const client = await pool.connect();

  try {
    // Create admin user
    const adminId = uuidv4();
    const passwordHash = await bcrypt.hash('admin123', 10);

    await client.query(
      `INSERT INTO users (id, email, name, password_hash, provider, role, theme)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING`,
      [adminId, 'admin@dsafocus.dev', 'Admin User', passwordHash, 'local', 'admin', 'light']
    );

    // Create regular test user
    const userId = uuidv4();
    const userPasswordHash = await bcrypt.hash('user1234', 10);

    await client.query(
      `INSERT INTO users (id, email, name, password_hash, provider, role, theme)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (email) DO NOTHING`,
      [userId, 'rahul@dsafocus.dev', 'Rahul', userPasswordHash, 'local', 'user', 'dark']
    );

    // Get the actual user IDs (in case they already existed)
    const { rows: [admin] } = await client.query("SELECT id FROM users WHERE email = 'admin@dsafocus.dev'");
    const { rows: [user] } = await client.query("SELECT id FROM users WHERE email = 'rahul@dsafocus.dev'");

    const targetUserId = user.id;

    // Insert sample problems
    for (let i = 0; i < SAMPLE_PROBLEMS.length; i++) {
      const p = SAMPLE_PROBLEMS[i];
      const problemId = `seed-${Date.now()}-${i}`;
      const date = new Date(Date.now() - (SAMPLE_PROBLEMS.length - i) * 86400000)
        .toISOString()
        .split('T')[0];

      await client.query(
        `INSERT INTO problems (id, user_id, date, name, url, platform, difficulty, topic, notes, hint_used, independent, needs_revision, time_spent, time_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING`,
        [problemId, targetUserId, date, p.name, p.url, p.platform, p.difficulty, p.topic, p.notes, p.hint_used, p.independent, p.needs_revision, p.time_spent, p.time_seconds]
      );
    }

    // Insert sample journals
    for (let i = 0; i < SAMPLE_JOURNALS.length; i++) {
      const j = SAMPLE_JOURNALS[i];
      const journalId = `journal-seed-${Date.now()}-${i}`;
      const date = new Date(Date.now() - (SAMPLE_JOURNALS.length - i) * 86400000 * 3)
        .toISOString()
        .split('T')[0];
      const timestamp = Date.now() - (SAMPLE_JOURNALS.length - i) * 86400000 * 3;

      await client.query(
        `INSERT INTO journals (id, user_id, date, timestamp, title, content, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [journalId, targetUserId, date, timestamp, j.title, j.content, timestamp]
      );
    }

    // Insert default timer state for test user
    await client.query(
      `INSERT INTO timer_states (user_id, time_left, total_duration, last_set_duration, is_running, is_break, saved_at)
       VALUES ($1, 1200, 1200, 1200, false, false, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [targetUserId, Date.now()]
    );

    console.log('  ✓ Admin user: admin@dsafocus.dev / admin123');
    console.log('  ✓ Test user:  rahul@dsafocus.dev / user1234');
    console.log(`  ✓ ${SAMPLE_PROBLEMS.length} sample problems inserted`);
    console.log(`  ✓ ${SAMPLE_JOURNALS.length} sample journals inserted`);
    console.log('  ✓ Timer state initialized');
  } finally {
    client.release();
    await pool.end();
  }
}

console.log('\n🌱 Seeding database...\n');
seed()
  .then(() => {
    console.log('\n✅ Seed complete.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Seed failed:', err.message);
    process.exit(1);
  });
