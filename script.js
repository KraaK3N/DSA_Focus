/**
 * ============================================================
 *  DSA Focus Dashboard — Main Application Script
 * ============================================================
 */

/* ─── 1. Local Storage Wrapper ─────────────────────────────── */
class Storage {
    static get(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || null;
        } catch {
            return null;
        }
    }
    static set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }
}

/* ─── 2. Toast Notification System ─────────────────────────── */
class Toast {
    static container = null;

    static init() {
        Toast.container = document.getElementById('toast-container');
    }

    static show(message, type = 'success', duration = 3000) {
        if (!Toast.container) Toast.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = { success: '✓', error: '✗', info: 'i' };
        toast.innerHTML = `
            <span class="toast-message">${message}</span>
        `;

        Toast.container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('toast-visible'));

        setTimeout(() => {
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }
}

/* ─── 3. Web Audio API Bell Chime ─────────────────────────── */
function playBellSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;
        
        // Synthesizing a pure, metallic bell tone
        const frequencies = [880, 1200, 1500, 2000];
        const gains = [0.25, 0.1, 0.05, 0.02];
        
        frequencies.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            
            gainNode.gain.setValueAtTime(gains[idx], now);
            // Long ringing decay
            gainNode.gain.exponentialRampToValueAtTime(0.00001, now + 2.0);
            
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            osc.start(now);
            osc.stop(now + 2.0);
        });
    } catch (e) {
        console.log('Audio not supported:', e);
    }
}

/* ─── 4. Focus Timer Class ─────────────────────────────────── */
class FocusTimer {
    constructor() {
        this.defaultFocus = 20 * 60;
        this.defaultBreak = 5 * 60;

        // lastSetDuration remembers the user's chosen duration so Reset
        // returns to it rather than always going back to 20 minutes.
        this.lastSetDuration = this.defaultFocus;

        this.timeLeft = this.defaultFocus;
        this.totalDuration = this.defaultFocus;
        this.elapsedSeconds = 0;

        this.isRunning = false;
        this.interval = null;
        this.isBreak = false;
        this._startTime = null;      // wall-clock ms when last started
        this._timeLeftAtStart = 0;  // timeLeft value when last started
        this._elapsedAtStart = 0;   // elapsedSeconds value when last started
        this._syncInterval = null;  // periodic backend sync

        // DOM Elements
        this.display = document.getElementById('countdown-display');
        this.ring = document.getElementById('timer-ring');
        this.btnStartPause = document.getElementById('btn-start-pause');
        this.indicator = document.getElementById('session-indicator');
        this.pomodoroToggle = document.getElementById('pomodoro-toggle');
        this.modal = document.getElementById('notification-modal');
        this.quoteEl = document.getElementById('motivational-quote');

        // SVG Ring circumference setup (r = 90)
        this.circumference = 2 * Math.PI * 90;
        this.ring.style.strokeDasharray = this.circumference;

        this.quotes = [
            "Take a hint. Don't waste another 30 minutes.",
            "Progress beats perfection.",
            "Pattern recognition comes from repetition.",
            "Learn, implement, move on.",
            "Interviews reward speed of recognition."
        ];

        this.updateDisplay();
        this.bindEvents();

        // Restore timer state from backend on page load
        this.restoreFromBackend();
    }

    /* ── Backend Sync ────────────────────────────────────────── */
    async restoreFromBackend() {
        try {
            const res = await fetch('http://localhost:3000/api/timer');
            if (!res.ok) return;
            const state = await res.json();

            // Apply persisted session type
            this.isBreak = state.isBreak;
            this.lastSetDuration = state.lastSetDuration || this.defaultFocus;
            this.totalDuration   = state.totalDuration   || this.lastSetDuration;

            // Update session label
            this.indicator.textContent = this.isBreak ? 'Break Session' : 'Focus Session';
            this.indicator.className   = `eyebrow ${this.isBreak ? 'break' : 'focus'}`;

            if (state.isRunning && state.savedAt) {
                // Timer was running when the browser was closed — fast-forward
                const elapsed = Math.floor((Date.now() - state.savedAt) / 1000);
                this.timeLeft = state.timeLeft - elapsed;
                this.updateDisplay();
                this.start(); // continue running
            } else {
                this.timeLeft = state.timeLeft;
                this.updateDisplay();
            }
        } catch (e) {
            // Backend not reachable — stay with defaults silently
        }
    }

    pushToBackend() {
        // Fire-and-forget — we don't need to await this
        fetch('http://localhost:3000/api/timer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timeLeft:        this.timeLeft,
                totalDuration:   this.totalDuration,
                lastSetDuration: this.lastSetDuration,
                isRunning:       this.isRunning,
                isBreak:         this.isBreak
            })
        }).catch(() => { /* ignore network errors */ });
    }

    bindEvents() {
        this.btnStartPause.addEventListener('click', () => this.toggle());
        document.getElementById('btn-reset-timer').addEventListener('click', () => this.reset());
        document.getElementById('btn-add-5').addEventListener('click', () => this.adjustTime(5 * 60));
        document.getElementById('btn-sub-5').addEventListener('click', () => this.adjustTime(-5 * 60));

        document.getElementById('btn-close-modal').addEventListener('click', () => {
            this.modal.classList.add('hidden');
        });
    }

    toggle() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    }

    start() {
        this.isRunning = true;
        this.btnStartPause.textContent = 'Pause';
        this.btnStartPause.classList.add('active');

        // Anchor to real wall-clock time so background throttling can't skew the count
        this._startTime = Date.now();
        this._timeLeftAtStart = this.timeLeft;
        this._elapsedAtStart = this.elapsedSeconds;

        this.interval = setInterval(() => {
            const secondsElapsed = Math.floor((Date.now() - this._startTime) / 1000);
            const prevTimeLeft = this.timeLeft;

            this.timeLeft = this._timeLeftAtStart - secondsElapsed;
            this.elapsedSeconds = this._elapsedAtStart + secondsElapsed;
            this.updateDisplay();

            // Fire alert exactly once when crossing zero
            if (prevTimeLeft > 0 && this.timeLeft <= 0) {
                this.triggerAlert();
            }
        }, 500); // poll twice per second so the display feels responsive

        // Sync to backend every 5 seconds while running
        clearInterval(this._syncInterval);
        this._syncInterval = setInterval(() => this.pushToBackend(), 5000);
        this.pushToBackend(); // immediate sync on start
    }

    pause() {
        this.isRunning = false;
        this.btnStartPause.textContent = 'Resume';
        this.btnStartPause.classList.remove('active');
        clearInterval(this.interval);
        clearInterval(this._syncInterval);
        this.pushToBackend(); // save current state
    }

    reset() {
        this.pause();
        this.btnStartPause.textContent = 'Start';
        // Use lastSetDuration so we restore the user's chosen time, not always 20m
        const resetTo = this.isBreak ? this.defaultBreak : this.lastSetDuration;
        this.timeLeft = resetTo;
        this.totalDuration = resetTo;
        this.elapsedSeconds = 0;
        this.updateDisplay();
        this.pushToBackend();
    }

    adjustTime(seconds) {
        this.timeLeft += seconds;
        if (this.timeLeft > this.totalDuration) {
            this.totalDuration = this.timeLeft;
        }
        // Save the new duration as the user's preferred duration
        if (!this.isBreak) {
            this.lastSetDuration = Math.max(60, this.timeLeft);
        }
        this.updateDisplay();
        this.pushToBackend();
    }

    triggerAlert() {
        playBellSound();
        document.body.classList.add('flash');
        setTimeout(() => document.body.classList.remove('flash'), 500);

        // Show motivational modal
        const quote = this.quotes[Math.floor(Math.random() * this.quotes.length)];
        this.quoteEl.textContent = `"${quote}"`;
        this.modal.classList.remove('hidden');
        this.pushToBackend();
    }

    updateDisplay() {
        const isNegative = this.timeLeft < 0;
        const absoluteSeconds = Math.abs(this.timeLeft);

        const m = Math.floor(absoluteSeconds / 60).toString().padStart(2, '0');
        const s = (absoluteSeconds % 60).toString().padStart(2, '0');

        this.display.textContent = `${isNegative ? '-' : ''}${m}:${s}`;

        if (isNegative) {
            this.display.classList.add('negative');
            this.ring.style.strokeDashoffset = this.circumference;
        } else {
            this.display.classList.remove('negative');
            const percent = this.timeLeft / Math.max(1, this.totalDuration);
            const offset = this.circumference - (percent * this.circumference);
            this.ring.style.strokeDashoffset = offset;
        }
    }

    getElapsedSeconds() {
        return this.elapsedSeconds;
    }

    getFormattedElapsed() {
        const h = Math.floor(this.elapsedSeconds / 3600);
        const m = Math.floor((this.elapsedSeconds % 3600) / 60);
        const s = this.elapsedSeconds % 60;

        if (h > 0) {
            return `${h}h ${m}m ${s}s`;
        }
        if (m > 0) {
            return `${m}m ${s}s`;
        }
        return `${s}s`;
    }
}

/* ─── 5. Main Application & Tracker Logic ─────────────────── */
class App {
    constructor() {
        this.timer = new FocusTimer();
        this.problems = [];
        this.editingId = null;

        // View Management (Dashboard vs Spreadsheet Log)
        this.activeTab = 'dashboard';
        
        this.bindForms();
        this.bindShortcuts();
        this.bindTabs();
        this.bindFilters();
        this.bindTheme();
        
        // Load data asynchronously from local server
        this.loadProblems();

        // Welcome Toast
        if (!Storage.get('dsa_welcomed_warm')) {
            setTimeout(() => {
                Toast.show('Welcome to your DSA Focus Dashboard!', 'info');
                Storage.set('dsa_welcomed_warm', true);
            }, 800);
        }
    }

    async loadProblems() {
        try {
            const response = await fetch('http://localhost:3000/api/problems');
            if (!response.ok) throw new Error('Network response was not ok');
            this.problems = await response.json();
            console.log('Successfully loaded problems from backend server.');
        } catch (error) {
            console.warn('Failed to load problems from server, falling back to localStorage:', error);
            this.problems = Storage.get('dsa_problems') || [];
            Toast.show('Could not connect to database server. Using local backup.', 'info');
        }
        this.renderSpreadsheet();
        this.updateStats();
    }

    bindForms() {
        const form = document.getElementById('problem-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProblem();
        });

        document.getElementById('btn-clear-form').addEventListener('click', () => {
            form.reset();
            this.editingId = null;
            document.getElementById('btn-save-problem').textContent = 'Save Problem';
            Toast.show('Form cleared', 'info');
        });
    }

    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement.tagName.toLowerCase();
            const isInputActive = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

            // Ctrl + S -> Save Problem
            if (e.ctrlKey && e.key.toLowerCase() === 's') {
                e.preventDefault();
                this.saveProblem();
                return;
            }

            if (isInputActive) return;

            // Space -> Start/Pause Timer
            if (e.code === 'Space') {
                e.preventDefault();
                this.timer.toggle();
            }
            // R -> Reset Timer
            if (e.key.toLowerCase() === 'r') {
                e.preventDefault();
                this.timer.reset();
            }
            // N -> Focus Problem Name Input
            if (e.key.toLowerCase() === 'n') {
                e.preventDefault();
                this.switchTab('dashboard');
                document.getElementById('p-name').focus();
            }
        });
    }

    bindTabs() {
        const tabDashboard = document.getElementById('tab-dashboard');
        const tabLog = document.getElementById('tab-log');

        tabDashboard.addEventListener('click', () => this.switchTab('dashboard'));
        tabLog.addEventListener('click', () => this.switchTab('log'));
    }

    switchTab(tabName) {
        if (this.activeTab === tabName) return;
        this.activeTab = tabName;

        const tabDashboard = document.getElementById('tab-dashboard');
        const tabLog = document.getElementById('tab-log');
        const viewDashboard = document.getElementById('dashboard-view');
        const viewLog = document.getElementById('log-view');

        if (tabName === 'dashboard') {
            tabDashboard.classList.add('active');
            tabLog.classList.remove('active');
            viewDashboard.classList.remove('hidden');
            viewLog.classList.add('hidden');
        } else {
            tabDashboard.classList.remove('active');
            tabLog.classList.add('active');
            viewDashboard.classList.add('hidden');
            viewLog.classList.remove('hidden');
            this.renderSpreadsheet();
        }
    }

    bindFilters() {
        const filterSearch = document.getElementById('filter-search');
        const filterDifficulty = document.getElementById('filter-difficulty');
        const filterRevision = document.getElementById('filter-revision');

        const applyFilters = () => {
            this.renderSpreadsheet(
                filterSearch.value,
                filterDifficulty.value,
                filterRevision.value
            );
        };

        filterSearch.addEventListener('input', applyFilters);
        filterDifficulty.addEventListener('change', applyFilters);
        filterRevision.addEventListener('change', applyFilters);

        document.getElementById('btn-export-csv').addEventListener('click', () => this.exportCSV());
    }

    bindTheme() {
        const themeBtn = document.getElementById('btn-theme-toggle');
        
        // Load initial theme state
        const isDark = Storage.get('dark_theme_active') === true;
        if (isDark) {
            document.body.classList.add('dark-theme');
            themeBtn.textContent = '☀️ Light Mode';
        } else {
            document.body.classList.remove('dark-theme');
            themeBtn.textContent = '🌙 Dark Mode';
        }

        themeBtn.addEventListener('click', () => {
            const currentlyDark = document.body.classList.contains('dark-theme');
            if (currentlyDark) {
                document.body.classList.remove('dark-theme');
                themeBtn.textContent = '🌙 Dark Mode';
                Storage.set('dark_theme_active', false);
                Toast.show('Switched to light theme', 'info');
            } else {
                document.body.classList.add('dark-theme');
                themeBtn.textContent = '☀️ Light Mode';
                Storage.set('dark_theme_active', true);
                Toast.show('Switched to dark theme', 'info');
            }
        });
    }

    saveProblem() {
        const nameInput = document.getElementById('p-name');
        if (!nameInput.value.trim()) {
            Toast.show('Problem name is required!', 'error');
            nameInput.focus();
            return;
        }

        const elapsedSecs = this.timer.getElapsedSeconds();
        const formattedTime = this.timer.getFormattedElapsed();

        const problemData = {
            id: this.editingId || Date.now().toString(),
            date: new Date().toISOString().split('T')[0],
            name: nameInput.value.trim(),
            url: document.getElementById('p-url').value.trim(),
            platform: document.getElementById('p-platform').value.trim() || 'N/A',
            difficulty: document.getElementById('p-difficulty').value,
            topic: document.getElementById('p-topic').value.trim() || 'General',
            notes: document.getElementById('p-notes').value.trim(),
            hintUsed: document.getElementById('p-hint').checked,
            independent: document.getElementById('p-independent').checked,
            needsRevision: document.getElementById('p-revision').checked,
            timeSpent: formattedTime,
            timeSeconds: elapsedSecs
        };

        const isUpdate = !!this.editingId;

        if (isUpdate) {
            // Update existing
            const idx = this.problems.findIndex(p => p.id === this.editingId);
            if (idx !== -1) {
                problemData.date = this.problems[idx].date;
                // Preserve time unless they actively tracked new time
                if (elapsedSecs === 0) {
                    problemData.timeSpent = this.problems[idx].timeSpent;
                    problemData.timeSeconds = this.problems[idx].timeSeconds;
                }
                this.problems[idx] = problemData;
            }
            this.editingId = null;
            document.getElementById('btn-save-problem').textContent = 'Save Problem';
        } else {
            // New Problem
            this.problems.unshift(problemData);

            // Handle Pomodoro session switch
            const pomodoroToggle = document.getElementById('pomodoro-toggle');
            if (pomodoroToggle.checked) {
                this.timer.isBreak = !this.timer.isBreak;
                // After a problem submission, switch session type but keep lastSetDuration for focus
                const nextDuration = this.timer.isBreak
                    ? this.timer.defaultBreak
                    : this.timer.lastSetDuration;
                this.timer.timeLeft = nextDuration;
                this.timer.totalDuration = nextDuration;
                this.timer.indicator.textContent = this.timer.isBreak ? 'Break Session' : 'Focus Session';
                this.timer.indicator.className = `eyebrow ${this.timer.isBreak ? 'break' : 'focus'}`;
            }

            this.timer.reset();
        }

        // Save backup to local storage
        Storage.set('dsa_problems', this.problems);

        // Async save to server
        this.saveProblemToServer(problemData, isUpdate);

        // Reset form
        document.getElementById('problem-form').reset();

        const card = document.getElementById('problem-form-card');
        card.classList.add('saving');
        setTimeout(() => card.classList.remove('saving'), 500);

        this.renderSpreadsheet();
        this.updateStats();
    }

    async saveProblemToServer(problemData, isUpdate) {
        try {
            const response = await fetch('http://localhost:3000/api/problems', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(problemData)
            });
            if (!response.ok) throw new Error('Network response was not ok');
            Toast.show(isUpdate ? 'Problem updated in database! ✓' : 'Problem saved to database! ✓', 'success');
        } catch (error) {
            console.error('Failed to save to server:', error);
            Toast.show('Could not save to database server. Saved locally.', 'error');
        }
    }

    editProblem(id) {
        const problem = this.problems.find(p => p.id === id);
        if (!problem) return;

        this.editingId = id;
        document.getElementById('p-name').value = problem.name;
        document.getElementById('p-url').value = problem.url || '';
        document.getElementById('p-platform').value = problem.platform;
        document.getElementById('p-difficulty').value = problem.difficulty;
        document.getElementById('p-topic').value = problem.topic;
        document.getElementById('p-notes').value = problem.notes || '';
        document.getElementById('p-hint').checked = problem.hintUsed;
        document.getElementById('p-independent').checked = problem.independent;
        document.getElementById('p-revision').checked = problem.needsRevision || false;

        document.getElementById('btn-save-problem').textContent = 'Update';
        
        // Go back to the dashboard view
        this.switchTab('dashboard');
        
        // Scroll to form card
        document.getElementById('problem-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });

        Toast.show('Editing: ' + problem.name, 'info');
    }

    deleteProblem(id) {
        if (confirm("Are you sure you want to remove this problem log?")) {
            this.problems = this.problems.filter(p => p.id !== id);
            Storage.set('dsa_problems', this.problems);
            this.deleteProblemFromServer(id);
            this.renderSpreadsheet();
            this.updateStats();
        }
    }

    async deleteProblemFromServer(id) {
        try {
            const response = await fetch(`http://localhost:3000/api/problems/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('Network response was not ok');
            Toast.show('Problem removed from database ✓', 'info');
        } catch (error) {
            console.error('Failed to delete from server:', error);
            Toast.show('Could not delete from database server.', 'error');
        }
    }

    renderSpreadsheet(searchQuery = '', selectedDifficulty = 'All', selectedRevision = 'All') {
        const tbody = document.getElementById('spreadsheet-body');
        const emptyState = document.getElementById('spreadsheet-empty');
        
        const filtered = this.problems.filter(p => {
            const query = searchQuery.toLowerCase().trim();
            const matchesSearch = !query || 
                p.name.toLowerCase().includes(query) ||
                p.platform.toLowerCase().includes(query) ||
                p.topic.toLowerCase().includes(query) ||
                p.notes.toLowerCase().includes(query);

            const matchesDifficulty = selectedDifficulty === 'All' || p.difficulty === selectedDifficulty;
            
            let matchesRevision = true;
            if (selectedRevision === 'Yes') {
                matchesRevision = p.needsRevision === true;
            } else if (selectedRevision === 'No') {
                matchesRevision = !p.needsRevision;
            }

            return matchesSearch && matchesDifficulty && matchesRevision;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        tbody.innerHTML = '';

        filtered.forEach(p => {
            const tr = document.createElement('tr');
            tr.className = p.difficulty.toLowerCase();
            tr.dataset.id = p.id;

            const hintBadge = p.hintUsed 
                ? '<span class="badge badge-hint">💡 Hint</span>' 
                : '<span class="badge">None</span>';
            const soloBadge = p.independent 
                ? '<span class="badge badge-solo">Solo</span>' 
                : '<span class="badge badge-help">Help</span>';

            const revisionCellContent = p.needsRevision
                ? '<span class="badge badge-revision">🔄 Yes</span>'
                : '<span class="text-muted">No</span>';

            const diffBadge = `<span class="badge badge-diff badge-${p.difficulty.toLowerCase()}">${p.difficulty}</span>`;

            const displayNotes = p.notes 
                ? (p.notes.length > 50 ? p.notes.substring(0, 47) + '...' : p.notes)
                : '-';

            const displayNameHtml = p.url 
                ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.name}</a>`
                : p.name;

            tr.innerHTML = `
                <td><b>${p.date}</b></td>
                <td><b>${displayNameHtml}</b></td>
                <td><span class="tracker-item-platform">${p.platform}</span></td>
                <td>${diffBadge}</td>
                <td><span class="text-muted">${p.topic}</span></td>
                <td><code class="font-mono">${p.timeSpent}</code></td>
                <td>${hintBadge}</td>
                <td>${soloBadge}</td>
                <td>${revisionCellContent}</td>
                <td class="notes-cell" title="Click to view full notes">${displayNotes}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-edit-btn" data-id="${p.id}">Edit</button>
                        <button class="table-delete-btn" data-id="${p.id}">Delete</button>
                    </div>
                </td>
            `;

            const notesCell = tr.querySelector('.notes-cell');
            if (p.notes) {
                notesCell.addEventListener('click', () => {
                    alert(`Notes for ${p.name}:\n\n${p.notes}`);
                });
            }

            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.table-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteProblem(e.currentTarget.dataset.id);
            });
        });

        tbody.querySelectorAll('.table-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editProblem(e.currentTarget.dataset.id);
            });
        });
    }

    exportCSV() {
        if (this.problems.length === 0) {
            Toast.show('No problem data to export!', 'error');
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Problem Name,URL,Platform,Difficulty,Topic,Time Spent,Hint Used,Solved Independently,Revision Required,Notes\r\n";

        this.problems.forEach(p => {
            const row = [
                p.date,
                `"${p.name.replace(/"/g, '""')}"`,
                `"${(p.url || '').replace(/"/g, '""')}"`,
                `"${p.platform.replace(/"/g, '""')}"`,
                p.difficulty,
                `"${p.topic.replace(/"/g, '""')}"`,
                p.timeSpent,
                p.hintUsed ? "Yes" : "No",
                p.independent ? "Yes" : "No",
                p.needsRevision ? "Yes" : "No",
                `"${(p.notes || '').replace(/"/g, '""')}"`
            ];
            csvContent += row.join(",") + "\r\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `dsa_problems_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        Toast.show('CSV Export downloaded!', 'success');
    }

    updateStats() {
        const todayStr = new Date().toISOString().split('T')[0];

        let todayCount = 0;
        let todaySeconds = 0;  // focus time for TODAY only
        let totalSeconds = 0;  // all-time total (for avg calculation)
        let easyCount = 0;
        let mediumCount = 0;
        let hardCount = 0;
        const uniqueDates = new Set();

        this.problems.forEach(p => {
            if (p.date === todayStr) {
                todayCount++;
                todaySeconds += p.timeSeconds || 0; // accumulate only today's focus time
            }
            totalSeconds += p.timeSeconds || 0;
            if (p.difficulty === 'Easy') easyCount++;
            else if (p.difficulty === 'Medium') mediumCount++;
            else if (p.difficulty === 'Hard') hardCount++;
            uniqueDates.add(p.date);
        });

        this.animateStat('stat-today', todayCount);
        this.animateStat('stat-easy', easyCount);
        this.animateStat('stat-medium', mediumCount);
        this.animateStat('stat-hard', hardCount);
        this.animateStat('stat-total', this.problems.length);

        // Update DSA Progress SVG Ring
        const total = this.problems.length;
        const radius = 40;
        const circum = 2 * Math.PI * radius;
        const arcEasy = document.getElementById('dsa-arc-easy');
        const arcMed = document.getElementById('dsa-arc-medium');
        const arcHard = document.getElementById('dsa-arc-hard');

        if (arcEasy && arcMed && arcHard) {
            if (total === 0) {
                arcEasy.style.strokeDasharray = `0 ${circum}`;
                arcMed.style.strokeDasharray = `0 ${circum}`;
                arcHard.style.strokeDasharray = `0 ${circum}`;
            } else {
                const lenEasy = (easyCount / total) * circum;
                const lenMed = (mediumCount / total) * circum;
                const lenHard = (hardCount / total) * circum;

                let activeTypes = (easyCount > 0 ? 1 : 0) + (mediumCount > 0 ? 1 : 0) + (hardCount > 0 ? 1 : 0);
                const gap = activeTypes > 1 ? 4 : 0;

                const showLenEasy = lenEasy > 0 ? Math.max(0, lenEasy - gap) : 0;
                const showLenMed = lenMed > 0 ? Math.max(0, lenMed - gap) : 0;
                const showLenHard = lenHard > 0 ? Math.max(0, lenHard - gap) : 0;

                arcEasy.style.strokeDasharray = `${showLenEasy} ${circum}`;
                arcEasy.style.strokeDashoffset = `0`;

                arcMed.style.strokeDasharray = `${showLenMed} ${circum}`;
                arcMed.style.strokeDashoffset = `-${lenEasy}`;

                arcHard.style.strokeDasharray = `${showLenHard} ${circum}`;
                arcHard.style.strokeDashoffset = `-${lenEasy + lenMed}`;
            }
        }

        // Show TODAY's focus time (not all-time total)
        const todayMinutes = Math.round(todaySeconds / 60);
        const statTimeEl = document.getElementById('stat-time');
        if (statTimeEl) {
            statTimeEl.textContent = todayMinutes >= 60
                ? `${Math.floor(todayMinutes / 60)}h ${todayMinutes % 60}m`
                : `${todayMinutes}m`;
        }

        const statAvgEl = document.getElementById('stat-avg');
        if (statAvgEl) {
            if (this.problems.length > 0) {
                const avgSecs = Math.round(totalSeconds / this.problems.length);
                const avgMins = Math.round(avgSecs / 60);
                statAvgEl.textContent = avgMins > 0 ? `${avgMins}m` : `${avgSecs}s`;
            } else {
                statAvgEl.textContent = '0m';
            }
        }

        const sortedDates = Array.from(uniqueDates).sort((a, b) => new Date(b) - new Date(a));
        let streak = 0;
        let checkDate = new Date();
        checkDate.setHours(0, 0, 0, 0);

        for (let i = 0; i < sortedDates.length; i++) {
            const pDate = new Date(sortedDates[i]);
            pDate.setHours(0, 0, 0, 0);
            const diffDays = Math.round((checkDate - pDate) / (1000 * 60 * 60 * 24));

            if (diffDays === 0 || diffDays === 1) {
                streak++;
                checkDate = new Date(pDate);
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }
        this.animateStat('stat-streak', streak);

        const progressPercent = Math.min((todayCount / 10) * 100, 100);
        const dailyProg = document.getElementById('daily-progress');
        const progText = document.getElementById('progress-text');
        if (dailyProg) dailyProg.style.width = `${progressPercent}%`;
        if (progText) progText.textContent = `${todayCount}/10`;
    }

    animateStat(elementId, targetValue) {
        const el = document.getElementById(elementId);
        if (!el) return;
        const current = parseInt(el.textContent) || 0;
        if (current === targetValue) return;

        const duration = 400;
        const startTime = performance.now();

        function step(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value = Math.round(current + (targetValue - current) * eased);
            el.textContent = value;

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
    window.dsaApp = new App();
});