const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow all origins for local requests
app.use(express.json());

// ─── In-Memory Timer State ──────────────────────────────────
// This lets the timer survive browser reloads / tab closes.
let timerState = {
    timeLeft: 20 * 60,       // seconds remaining when last saved
    totalDuration: 20 * 60,  // the full duration for the current session
    lastSetDuration: 20 * 60,// the user's last chosen duration (persisted across resets)
    isRunning: false,
    isBreak: false,
    savedAt: null            // epoch ms when the state was last saved
};

// GET timer state — the frontend adjusts timeLeft based on elapsed wall-clock time
app.get('/api/timer', (req, res) => {
    res.json(timerState);
});

// POST timer state — frontend pushes its current state
app.post('/api/timer', (req, res) => {
    const { timeLeft, totalDuration, lastSetDuration, isRunning, isBreak } = req.body;
    timerState = {
        timeLeft:        typeof timeLeft        === 'number' ? timeLeft        : timerState.timeLeft,
        totalDuration:   typeof totalDuration   === 'number' ? totalDuration   : timerState.totalDuration,
        lastSetDuration: typeof lastSetDuration  === 'number' ? lastSetDuration  : timerState.lastSetDuration,
        isRunning:       typeof isRunning        === 'boolean' ? isRunning       : timerState.isRunning,
        isBreak:         typeof isBreak          === 'boolean' ? isBreak         : timerState.isBreak,
        savedAt:         Date.now()
    };
    res.json({ success: true });
});

// Serve static files (index.html, script.js, styles.css) from the parent directory
app.use(express.static(path.join(__dirname, '..')));

// Open/Create Database
const dbPath = path.join(__dirname, 'dsa_problems.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database at:', dbPath);
    }
});

// Initialize Table
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS problems (
        id TEXT PRIMARY KEY,
        date TEXT,
        name TEXT,
        url TEXT,
        platform TEXT,
        difficulty TEXT,
        topic TEXT,
        notes TEXT,
        hintUsed INTEGER,
        independent INTEGER,
        needsRevision INTEGER,
        timeSpent TEXT,
        timeSeconds INTEGER
    )`, (err) => {
        if (err) {
            console.error('Error creating table:', err.message);
        } else {
            console.log('Problems table checked/created.');
        }
    });
});

// GET all problems
app.get('/api/problems', (req, res) => {
    db.all("SELECT * FROM problems ORDER BY date DESC, id DESC", [], (err, rows) => {
        if (err) {
            console.error('GET Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        // Map integer booleans back to JS boolean type
        const problems = rows.map(r => ({
            ...r,
            hintUsed: r.hintUsed === 1,
            independent: r.independent === 1,
            needsRevision: r.needsRevision === 1
        }));
        res.json(problems);
    });
});

// POST (Insert or Replace) a problem
app.post('/api/problems', (req, res) => {
    const p = req.body;
    if (!p.id || !p.name) {
        return res.status(400).json({ error: 'Missing required fields (id, name)' });
    }

    const query = `
        INSERT OR REPLACE INTO problems (
            id, date, name, url, platform, difficulty, topic, notes, 
            hintUsed, independent, needsRevision, timeSpent, timeSeconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(query, [
        p.id,
        p.date,
        p.name,
        p.url || '',
        p.platform || 'N/A',
        p.difficulty || 'Medium',
        p.topic || 'General',
        p.notes || '',
        p.hintUsed ? 1 : 0,
        p.independent ? 1 : 0,
        p.needsRevision ? 1 : 0,
        p.timeSpent || '0s',
        p.timeSeconds || 0
    ], function(err) {
        if (err) {
            console.error('POST Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, id: p.id });
    });
});

// DELETE a problem by ID
app.delete('/api/problems/:id', (req, res) => {
    const { id } = req.params;
    db.run("DELETE FROM problems WHERE id = ?", [id], function(err) {
        if (err) {
            console.error('DELETE Error:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, changes: this.changes });
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Timer state endpoint available at /api/timer');
});
