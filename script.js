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
        const prevTimeLeft = this.timeLeft;
        this.timeLeft += seconds;

        if (this.isRunning) {
            this._timeLeftAtStart += seconds;
        }

        this.totalDuration = Math.max(60, this.totalDuration + seconds);
        if (!this.isBreak) {
            this.lastSetDuration = Math.max(60, this.lastSetDuration + seconds);
        }

        this.updateDisplay();
        this.pushToBackend();

        // Trigger alert if manually adjusted to/below zero
        if (prevTimeLeft > 0 && this.timeLeft <= 0) {
            this.triggerAlert();
        }
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

/* ─── 4.5. Notion-Style Scratchpad ───────────────────────── */
class Scratchpad {
    constructor() {
        this.editor = document.getElementById('scratchpad-editor');
        this.slashMenu = document.getElementById('scratchpad-slash-menu');
        this.btnClear = document.getElementById('btn-scratch-clear');
        this.menuItems = Array.from(this.slashMenu.querySelectorAll('.slash-item'));
        
        this.selectedIndex = 0;
        this.menuOpen = false;
        this.saveTimeout = null;
        this.commandRange = null;
        this.activeBlock = null;
        this.visibleItems = [];

        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadContent();
    }

    bindEvents() {
        // Debounced save on typing / input
        this.editor.addEventListener('input', () => {
            this.handleInput();
            this.autoSave();
        });

        // Click delegation for checkboxes
        this.editor.addEventListener('click', (e) => {
            if (e.target.classList.contains('scratch-todo-checkbox')) {
                const row = e.target.closest('.scratch-todo-row');
                if (row) {
                    if (e.target.checked) {
                        row.classList.add('checked');
                        e.target.setAttribute('checked', 'checked');
                    } else {
                        row.classList.remove('checked');
                        e.target.removeAttribute('checked');
                    }
                    this.saveContent();
                }
            }
        });

        // Keyboard navigation, Enter & Backspace formatting handling
        this.editor.addEventListener('keydown', (e) => {
            if (this.menuOpen) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateMenu(1);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateMenu(-1);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const selectedItem = this.menuItems[this.selectedIndex];
                    if (selectedItem) {
                        const cmd = selectedItem.getAttribute('data-cmd');
                        this.executeCommand(cmd);
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeMenu();
                }
                return;
            }

            // Custom Enter Key Handling inside list items
            if (e.key === 'Enter') {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const block = this.getCurrentBlock();
                    if (block) {
                        const todoRow = block.closest('.scratch-todo-row');
                        const bulletRow = block.closest('.scratch-bullet-row');
                        
                        if (todoRow) {
                            e.preventDefault();
                            const newTodo = document.createElement('div');
                            newTodo.className = 'scratch-todo-row';
                            newTodo.innerHTML = `
                                <input type="checkbox" class="scratch-todo-checkbox">
                                <span class="scratch-todo-text" contenteditable="true" data-placeholder="Task..."></span>
                            `;
                            todoRow.parentNode.insertBefore(newTodo, todoRow.nextSibling);
                            this.setCaretToEnd(newTodo.querySelector('.scratch-todo-text'));
                            this.saveContent();
                            return;
                        }
                        
                        if (bulletRow) {
                            e.preventDefault();
                            const newBullet = document.createElement('div');
                            newBullet.className = 'scratch-bullet-row';
                            newBullet.setAttribute('data-placeholder', 'List item...');
                            newBullet.textContent = '';
                            bulletRow.parentNode.insertBefore(newBullet, bulletRow.nextSibling);
                            this.setCaretToEnd(newBullet);
                            this.saveContent();
                            return;
                        }
                    }
                }
            }

            // Custom Backspace Handling for converting list items back to normal blocks
            if (e.key === 'Backspace') {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const block = this.getCurrentBlock();
                    if (block) {
                        const todoRow = block.closest('.scratch-todo-row');
                        const bulletRow = block.closest('.scratch-bullet-row');
                        
                        if (todoRow) {
                            const text = todoRow.querySelector('.scratch-todo-text').textContent;
                            if (text.length === 0) {
                                e.preventDefault();
                                const newBlock = document.createElement('div');
                                newBlock.innerHTML = '&nbsp;';
                                todoRow.parentNode.replaceChild(newBlock, todoRow);
                                this.setCaretToEnd(newBlock);
                                this.saveContent();
                                return;
                            }
                        }
                        
                        if (bulletRow) {
                            const text = bulletRow.textContent.replace(/\s/g, '');
                            if (text.length === 0) {
                                e.preventDefault();
                                const newBlock = document.createElement('div');
                                newBlock.innerHTML = '&nbsp;';
                                bulletRow.parentNode.replaceChild(newBlock, bulletRow);
                                this.setCaretToEnd(newBlock);
                                this.saveContent();
                                return;
                            }
                        }
                    }
                }
            }

            // Inline Markdown-like Auto-conversions on Space key press
            if (e.key === ' ') {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const block = this.getCurrentBlock();
                    if (block) {
                        const blockText = block.innerText || block.textContent || "";
                        const textBeforeCursor = blockText.slice(0, range.startOffset).trim();

                        if (textBeforeCursor === '[]' || textBeforeCursor === '- [ ]') {
                            e.preventDefault();
                            this.executeCommand('todo');
                        } else if (textBeforeCursor === '-') {
                            e.preventDefault();
                            this.executeCommand('bullet');
                        } else if (textBeforeCursor === '#') {
                            e.preventDefault();
                            this.executeCommand('h1');
                        } else if (textBeforeCursor === '##') {
                            e.preventDefault();
                            this.executeCommand('h2');
                        } else if (textBeforeCursor === '---') {
                            e.preventDefault();
                            this.executeCommand('divider');
                        }
                    }
                }
            }
        });

        // Clear board button
        this.btnClear.addEventListener('click', () => {
            if (confirm("Are you sure you want to clear the scratch board?")) {
                this.editor.innerHTML = '';
                this.saveContent();
            }
        });

        // Handle slash menu options with mousedown (to prevent focus loss) and click
        this.menuItems.forEach((item) => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
            });
            item.addEventListener('click', () => {
                const cmd = item.getAttribute('data-cmd');
                this.executeCommand(cmd);
            });
        });

        // Close slash menu when clicking outside of the editor or menu
        document.addEventListener('click', (e) => {
            if (!this.editor.contains(e.target) && !this.slashMenu.contains(e.target)) {
                this.closeMenu();
            }
        });
    }

    async loadContent() {
        try {
            const response = await fetch('http://localhost:3000/api/kv/scratchpad');
            if (response.ok) {
                const data = await response.json();
                if (data && data.value) {
                    this.editor.innerHTML = data.value;
                    return;
                }
            }
        } catch (err) {
            console.warn('Failed to load scratchpad from server, falling back to localStorage:', err);
        }

        const saved = localStorage.getItem('dsa_scratchpad');
        if (saved) {
            this.editor.innerHTML = saved;
        }
    }

    autoSave() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => this.saveContent(), 1000);
    }

    async saveContent() {
        const html = this.editor.innerHTML;
        localStorage.setItem('dsa_scratchpad', html);

        try {
            await fetch('http://localhost:3000/api/kv/scratchpad', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: html })
            });
        } catch (err) {
            // ignore network save errors
        }
    }

    handleInput() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !this.editor.contains(selection.anchorNode)) {
            this.closeMenu();
            return;
        }

        const range = selection.getRangeAt(0);
        const textBeforeCaret = this.getTextBeforeCaret(range);

        if (/^\s*\/[a-z0-9-]*$/i.test(textBeforeCaret)) {
            this.commandRange = range.cloneRange();
            this.openMenu();
            
            const queryMatch = textBeforeCaret.match(/\/([a-z0-9-]*)$/i);
            const query = queryMatch ? queryMatch[1].toLowerCase() : '';
            this.filterMenu(query);
        } else if (this.menuOpen) {
            this.closeMenu();
        }
    }

    openMenu() {
        this.menuOpen = true;
        this.selectedIndex = 0;
        this.updateMenuHighlight();
        this.activeBlock = this.getCurrentBlock();

        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            const containerRect = this.editor.parentElement.getBoundingClientRect();

            this.slashMenu.style.left = `${rect.left - containerRect.left}px`;
            this.slashMenu.style.top = `${rect.bottom - containerRect.top + 8}px`;
            this.slashMenu.classList.remove('hidden');
        }
    }

    closeMenu() {
        this.menuOpen = false;
        this.slashMenu.classList.add('hidden');
        this.activeBlock = null;
    }

    filterMenu(query) {
        this.visibleItems = [];
        this.menuItems.forEach((item) => {
            const cmd = item.getAttribute('data-cmd') || '';
            const name = item.querySelector('.name')?.textContent?.toLowerCase() || '';
            const isMatch = cmd.startsWith(query) || name.includes(query);
            
            if (isMatch) {
                item.removeAttribute('hidden');
                this.visibleItems.push(item);
            } else {
                item.setAttribute('hidden', 'true');
            }
        });

        if (this.visibleItems.length === 0) {
            this.closeMenu();
        } else {
            const currentItem = this.menuItems[this.selectedIndex];
            if (!this.visibleItems.includes(currentItem)) {
                this.selectedIndex = this.menuItems.indexOf(this.visibleItems[0]);
            }
            this.updateMenuHighlight();
        }
    }

    navigateMenu(direction) {
        if (!this.visibleItems || this.visibleItems.length === 0) return;
        
        const currentItem = this.menuItems[this.selectedIndex];
        let visibleIdx = this.visibleItems.indexOf(currentItem);
        
        if (visibleIdx === -1) {
            visibleIdx = 0;
        } else {
            visibleIdx = (visibleIdx + direction + this.visibleItems.length) % this.visibleItems.length;
        }
        
        const nextItem = this.visibleItems[visibleIdx];
        this.selectedIndex = this.menuItems.indexOf(nextItem);
        this.updateMenuHighlight();
    }

    updateMenuHighlight() {
        this.menuItems.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    getCurrentBlock() {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || !this.editor.contains(selection.anchorNode)) {
            return this.editor;
        }

        let node = selection.anchorNode;
        
        // Wrap naked text nodes directly in editor
        if (node.nodeType === Node.TEXT_NODE && node.parentNode === this.editor) {
            const block = document.createElement('div');
            block.className = 'scratch-paragraph';
            this.editor.insertBefore(block, node);
            block.appendChild(node);
            return block;
        }

        if (node === this.editor) {
            const child = this.editor.childNodes[selection.anchorOffset];
            if (child?.nodeType === Node.ELEMENT_NODE && 
                (child.tagName === 'DIV' || child.tagName === 'P' || child.classList.contains('scratch-todo-row') || child.classList.contains('scratch-bullet-row'))) {
                return child;
            }
            return this.editor;
        }

        // Walk up to find the closest block element child of the editor
        let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        while (el && el !== this.editor) {
            if (el.classList.contains('scratch-todo-row') || 
                el.classList.contains('scratch-bullet-row') || 
                el.classList.contains('scratch-paragraph') || 
                el.classList.contains('scratch-h1') || 
                el.classList.contains('scratch-h2') ||
                (el.parentNode === this.editor && (el.tagName === 'DIV' || el.tagName === 'P'))) {
                return el;
            }
            el = el.parentElement;
        }

        return this.editor;
    }

    getTextBeforeCaret(range) {
        const block = this.getCurrentBlock();
        const root = block === this.editor ? this.editor : block;
        const beforeCaret = document.createRange();

        try {
            beforeCaret.selectNodeContents(root);
            beforeCaret.setEnd(range.endContainer, range.endOffset);
            return beforeCaret.toString().replace(/\u00a0/g, ' ');
        } catch {
            return '';
        }
    }

    restoreSelection(range) {
        if (!range || !this.editor.contains(range.startContainer)) return;

        this.editor.focus();
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }

    createEmptyBlock(className = 'scratch-paragraph') {
        const block = document.createElement('div');
        block.className = className;
        block.appendChild(document.createElement('br'));
        return block;
    }

    executeCommand(cmd) {
        this.closeMenu();
        const block = this.activeBlock || this.getCurrentBlock() || this.editor;
        this.activeBlock = null;

        let text = block.textContent || "";
        text = text.replace(/\/[a-z0-9-]*$/i, "");
        text = text.replace(/^(\[\]|- \[ \]|-\s?|##\s?|#\s?|---\s?)/, "");
        text = text.trim();

        let newEl;
        if (cmd === 'todo') {
            newEl = document.createElement('div');
            newEl.className = 'scratch-todo-row';
            newEl.innerHTML = `
                <input type="checkbox" class="scratch-todo-checkbox">
                <span class="scratch-todo-text" contenteditable="true" data-placeholder="Task...">${text}</span>
            `;
        } else if (cmd === 'bullet') {
            newEl = document.createElement('div');
            newEl.className = 'scratch-bullet-row';
            newEl.setAttribute('data-placeholder', 'List item...');
            newEl.textContent = text;
        } else if (cmd === 'h1') {
            newEl = document.createElement('div');
            newEl.className = 'scratch-h1';
            newEl.setAttribute('data-placeholder', 'Heading 1');
            newEl.textContent = text;
        } else if (cmd === 'h2') {
            newEl = document.createElement('div');
            newEl.className = 'scratch-h2';
            newEl.setAttribute('data-placeholder', 'Heading 2');
            newEl.textContent = text;
        } else if (cmd === 'divider') {
            newEl = document.createElement('hr');
            newEl.className = 'scratch-divider';
            
            const nextLine = document.createElement('div');
            nextLine.innerHTML = '&nbsp;';
            block.parentNode.replaceChild(nextLine, block);
            nextLine.parentNode.insertBefore(newEl, nextLine);
            this.setCaretToEnd(nextLine);
            this.saveContent();
            return;
        }

        if (newEl) {
            if (block === this.editor) {
                // Safely remove direct text nodes to preserve existing block items
                const children = Array.from(this.editor.childNodes);
                children.forEach(child => {
                    if (child.nodeType === Node.TEXT_NODE) {
                        child.remove();
                    }
                });
                this.editor.appendChild(newEl);
            } else {
                block.parentNode.replaceChild(newEl, block);
            }

            if (cmd === 'todo') {
                this.setCaretToEnd(newEl.querySelector('.scratch-todo-text'));
            } else {
                this.setCaretToEnd(newEl);
            }
            this.saveContent();
        }
    }

    setCaretToEnd(element) {
        element.focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

/* ─── 5. Main Application & Tracker Logic ─────────────────── */
class App {
    constructor() {
        this.timer = new FocusTimer();
        this.scratchpad = new Scratchpad();
        this.problems = [];
        this.editingId = null;
        this.dailyGoal = 10;

        // View Management (Dashboard vs Spreadsheet Log)
        this.activeTab = 'dashboard';
        
        this.bindForms();
        this.bindShortcuts();
        this.bindTabs();
        this.bindFilters();
        this.bindTheme();
        this.bindNotesSidebar();
        this.bindGoalEvents();
        
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
        await this.loadGoal();
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

    bindNotesSidebar() {
        const sidebar = document.getElementById('notes-sidebar');
        const backdrop = document.getElementById('notes-sidebar-backdrop');
        const closeBtn = document.getElementById('notes-sidebar-close');

        const closeSidebar = () => {
            sidebar.classList.remove('active');
            backdrop.classList.remove('active');
            setTimeout(() => {
                sidebar.classList.add('hidden');
                backdrop.classList.add('hidden');
            }, 300); // Wait for transitout animation
        };

        closeBtn.addEventListener('click', closeSidebar);
        backdrop.addEventListener('click', closeSidebar);
        
        // Escape key to close sidebar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !sidebar.classList.contains('hidden')) {
                closeSidebar();
            }
        });
    }

    showNotesSidebar(problemName, notes) {
        const sidebar = document.getElementById('notes-sidebar');
        const backdrop = document.getElementById('notes-sidebar-backdrop');
        const titleEl = document.getElementById('notes-sidebar-title');
        const contentEl = document.getElementById('notes-sidebar-content');

        titleEl.textContent = problemName;
        contentEl.textContent = notes || 'No notes available.';

        // Show elements (make visible in layout)
        sidebar.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        
        // Trigger CSS transition animation
        setTimeout(() => {
            sidebar.classList.add('active');
            backdrop.classList.add('active');
        }, 10);
    }

    bindGoalEvents() {
        const btnEdit = document.getElementById('btn-edit-goal');
        if (!btnEdit) return;

        btnEdit.addEventListener('click', () => {
            const progText = document.getElementById('progress-text');
            if (!progText) return;

            // If already editing, do nothing
            if (progText.querySelector('input')) return;

            const parts = progText.textContent.split('/');
            const currentCount = parts[0] || '0';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'input-daily-goal';
            input.value = this.dailyGoal;
            input.min = 1;
            input.max = 100;

            progText.innerHTML = '';
            progText.appendChild(document.createTextNode(`${currentCount}/`));
            progText.appendChild(input);

            btnEdit.style.display = 'none';

            input.focus();
            input.select();

            let hasSaved = false;
            const saveAndRevert = (shouldSave = true) => {
                if (hasSaved) return;
                hasSaved = true;

                const val = parseInt(input.value);
                progText.innerHTML = ''; 

                if (shouldSave && !isNaN(val) && val > 0) {
                    this.saveGoal(val);
                } else {
                    this.updateStats();
                }
                btnEdit.style.display = 'inline-block';
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    saveAndRevert(true);
                } else if (e.key === 'Escape') {
                    saveAndRevert(false);
                }
            });

            input.addEventListener('blur', () => {
                saveAndRevert(true);
            });
        });
    }

    async loadGoal() {
        try {
            const response = await fetch('http://localhost:3000/api/kv/daily_goal');
            if (response.ok) {
                const data = await response.json();
                if (data && data.value) {
                    this.dailyGoal = parseInt(data.value) || 10;
                    return;
                }
            }
        } catch (err) {
            console.warn('Failed to load daily goal from server:', err);
        }
        this.dailyGoal = parseInt(localStorage.getItem('dsa_daily_goal')) || 10;
    }

    async saveGoal(newGoal) {
        this.dailyGoal = newGoal;
        localStorage.setItem('dsa_daily_goal', String(newGoal));
        try {
            await fetch('http://localhost:3000/api/kv/daily_goal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: String(newGoal) })
            });
        } catch (err) {
            // ignore network save errors
        }
        this.updateStats();
        Toast.show(`Daily goal updated to ${newGoal} problems!`, 'success');
    }

    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            const activeTag = document.activeElement.tagName.toLowerCase();
            const isInputActive = activeTag === 'input' || 
                                  activeTag === 'textarea' || 
                                  activeTag === 'select' || 
                                  document.activeElement.closest('#scratchpad-editor');

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
                    this.showNotesSidebar(p.name, p.notes);
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

        const progressPercent = Math.min((todayCount / this.dailyGoal) * 100, 100);
        const dailyProg = document.getElementById('daily-progress');
        const progText = document.getElementById('progress-text');
        if (dailyProg) dailyProg.style.width = `${progressPercent}%`;
        if (progText) {
            if (!progText.querySelector('input')) {
                progText.textContent = `${todayCount}/${this.dailyGoal}`;
            }
        }
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



class JournalManager {
constructor(app) {
this.app = app;
this.journals = [];
this.currentYear = new Date().getFullYear();
this.currentMonth = new Date().getMonth();
this.draftTimer = null;

this.initElements();
this.bindEvents();
this.loadJournals();
}

initElements() {
this.viewJournal = document.getElementById('journal-view');
this.btnOpenModal = document.getElementById('btn-open-journal-modal');
this.calendarGrid = document.getElementById('calendar-grid');
this.calendarMonthYear = document.getElementById('calendar-month-year');
this.btnPrevMonth = document.getElementById('btn-prev-month');
this.btnNextMonth = document.getElementById('btn-next-month');
this.btnToday = document.getElementById('btn-calendar-today');

this.entriesList = document.getElementById('journal-entries-list');
this.entriesCount = document.getElementById('journal-entries-count');
this.emptyState = document.getElementById('journal-empty');

// Modal elements
this.modal = document.getElementById('journal-modal');
this.btnCloseModal = document.getElementById('btn-close-journal-modal');
this.btnCancel = document.getElementById('btn-cancel-journal');
this.btnDelete = document.getElementById('btn-delete-journal');
this.form = document.getElementById('journal-form');
this.inputId = document.getElementById('journal-entry-id');
this.inputDate = document.getElementById('journal-entry-date');
this.inputTitle = document.getElementById('journal-title');
this.inputContent = document.getElementById('journal-content');
this.modalDateDisplay = document.getElementById('journal-modal-date');
this.modalTitleDisplay = document.getElementById('journal-modal-title');
this.wordCountBadge = document.getElementById('scratchpad-word-count');
this.draftIndicator = document.getElementById('scratchpad-draft-indicator');
}

    bindEvents() {
        // Document-level click handler for opening modal reliably
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#btn-open-journal-modal') || e.target.closest('.journal-new-btn') || e.target.closest('[data-action="open-journal"]');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                const todayStr = this.getTodayDateStr();
                this.openModalForDate(todayStr);
            }
        });

        if (this.btnCloseModal) {
            this.btnCloseModal.addEventListener('click', () => this.closeModal());
        }

        if (this.btnCancel) {
            this.btnCancel.addEventListener('click', () => this.closeModal());
        }

        document.addEventListener('click', (e) => {
            if (this.modal && e.target === this.modal) {
                this.closeModal();
            }
        });

        // Calendar Month Navigation
        if (this.btnPrevMonth) {
            this.btnPrevMonth.addEventListener('click', () => {
                this.currentMonth--;
                if (this.currentMonth < 0) {
                    this.currentMonth = 11;
                    this.currentYear--;
                }
                this.renderCalendar();
            });
        }

        if (this.btnNextMonth) {
            this.btnNextMonth.addEventListener('click', () => {
                this.currentMonth++;
                if (this.currentMonth > 11) {
                    this.currentMonth = 0;
                    this.currentYear++;
                }
                this.renderCalendar();
            });
        }

        if (this.btnToday) {
            this.btnToday.addEventListener('click', () => {
                const now = new Date();
                this.currentYear = now.getFullYear();
                this.currentMonth = now.getMonth();
                this.renderCalendar();
                this.renderDeckView();
            });
        }

        // View Mode Toggle (Grid vs Deck)
        if (this.btnViewGrid) {
            this.btnViewGrid.addEventListener('click', () => this.switchViewMode('grid'));
        }
        if (this.btnViewDeck) {
            this.btnViewDeck.addEventListener('click', () => this.switchViewMode('deck'));
        }

        // Deck Filters (All Days vs Entries Only)
        if (this.deckFilterAll) {
            this.deckFilterAll.addEventListener('click', () => {
                this.deckFilterMode = 'all';
                this.deckFilterAll.classList.add('active');
                if (this.deckFilterEntries) this.deckFilterEntries.classList.remove('active');
                this.renderDeckView();
            });
        }
        if (this.deckFilterEntries) {
            this.deckFilterEntries.addEventListener('click', () => {
                this.deckFilterMode = 'entries';
                this.deckFilterEntries.classList.add('active');
                if (this.deckFilterAll) this.deckFilterAll.classList.remove('active');
                this.renderDeckView();
            });
        }

        // Deck Arrows
        if (this.btnDeckPrev) {
            this.btnDeckPrev.addEventListener('click', () => this.navigateDeck(-1));
        }
        if (this.btnDeckNext) {
            this.btnDeckNext.addEventListener('click', () => this.navigateDeck(1));
        }

        // Keyboard Navigation (ArrowLeft / ArrowRight) for Deck View
        document.addEventListener('keydown', (e) => {
            if (this.activeView !== 'deck') return;
            if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            if (e.key === 'ArrowLeft') {
                this.navigateDeck(-1);
            } else if (e.key === 'ArrowRight') {
                this.navigateDeck(1);
            }
        });
    }


    openModalForDate(dateStr) {
        const existingEntry = (this.journals || []).find(j => j.date === dateStr);
        if (existingEntry) {
            this.openModalForEntry(existingEntry);
        } else {
            this.inputId.value = 'journal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            this.inputDate.value = dateStr;
            this.inputTitle.value = '';
            this.inputContent.value = '';

            const draft = Storage.get(`journal_draft_${dateStr}`);
            if (draft) {
                this.inputTitle.value = draft.title || '';
                this.inputContent.value = draft.content || '';
                if (this.draftIndicator) {
                    this.draftIndicator.textContent = '✏️ Loaded unsaved draft';
                    this.draftIndicator.classList.remove('hidden');
                }
            } else {
                if (this.draftIndicator) this.draftIndicator.classList.add('hidden');
            }

            if (this.modalDateDisplay) this.modalDateDisplay.textContent = this.formatDateDisplay(dateStr);
            if (this.modalTitleDisplay) this.modalTitleDisplay.textContent = 'Write Journal Entry';
            if (this.btnDelete) this.btnDelete.classList.add('hidden');

            this.updateWordCount();
            if (this.modal) this.modal.classList.remove('hidden');
            setTimeout(() => { if (this.inputTitle) this.inputTitle.focus(); }, 100);
        }
    }

    openModalForEntry(entry) {
        if (!entry) return;
        this.inputId.value = entry.id;
        this.inputDate.value = entry.date;
        this.inputTitle.value = entry.title || '';
        this.inputContent.value = entry.content || '';

        if (this.modalDateDisplay) this.modalDateDisplay.textContent = this.formatDateDisplay(entry.date);
        if (this.modalTitleDisplay) this.modalTitleDisplay.textContent = 'Edit Journal Entry';
        if (this.btnDelete) this.btnDelete.classList.remove('hidden');

        if (this.draftIndicator) this.draftIndicator.classList.add('hidden');
        this.updateWordCount();
        if (this.modal) this.modal.classList.remove('hidden');
        setTimeout(() => { if (this.inputContent) this.inputContent.focus(); }, 100);
    }

    closeModal() {
        if (this.modal) this.modal.classList.add('hidden');
        if (this.draftTimer) {
            clearTimeout(this.draftTimer);
            this.draftTimer = null;
        }
    }

    updateWordCount() {
        if (!this.wordCountBadge || !this.inputContent) return;
        const text = this.inputContent.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        this.wordCountBadge.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    }

    triggerDraftAutoSave() {
        if (this.draftTimer) clearTimeout(this.draftTimer);
        this.draftTimer = setTimeout(() => {
            const dateStr = this.inputDate.value;
            const title = this.inputTitle.value;
            const content = this.inputContent.value;
            if (content.trim() || title.trim()) {
                Storage.set(`journal_draft_${dateStr}`, { title, content, savedAt: Date.now() });
                if (this.draftIndicator) {
                    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    this.draftIndicator.textContent = `✓ Draft auto-saved at ${timeStr}`;
                    this.draftIndicator.classList.remove('hidden');
                }
            } else {
                localStorage.removeItem(`journal_draft_${dateStr}`);
                if (this.draftIndicator) this.draftIndicator.classList.add('hidden');
            }
        }, 300);
    }

    async saveEntry() {
        const id = this.inputId.value || ('journal_' + Date.now());
        const date = this.inputDate.value || this.getTodayDateStr();
        const title = this.inputTitle.value.trim();
        const content = this.inputContent.value.trim();

        if (!content) {
            Toast.show('Please write something in your journal entry before saving.', 'error');
            return;
        }

        const entryPayload = {
            id,
            date,
            timestamp: Date.now(),
            title,
            content,
            updatedAt: Date.now()
        };

        try {
            const response = await fetch('http://localhost:3000/api/journals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entryPayload)
            });

            if (!response.ok) throw new Error('API save failed');

            localStorage.removeItem(`journal_draft_${date}`);

            const existingIdx = this.journals.findIndex(j => j.id === id);
            if (existingIdx >= 0) {
                this.journals[existingIdx] = entryPayload;
            } else {
                this.journals.unshift(entryPayload);
            }

            Storage.set('dsa_journals', this.journals);
            Toast.show('Journal entry saved successfully! 📝', 'success');
            this.closeModal();
            this.renderCalendar();
            this.renderEntriesList();
            this.renderDeckView();
        } catch (e) {
            console.warn('Backend save failed, using local storage fallback:', e);
            const existingIdx = this.journals.findIndex(j => j.id === id);
            if (existingIdx >= 0) {
                this.journals[existingIdx] = entryPayload;
            } else {
                this.journals.unshift(entryPayload);
            }
            Storage.set('dsa_journals', this.journals);
            localStorage.removeItem(`journal_draft_${date}`);
            Toast.show('Journal entry saved locally! 📝', 'success');
            this.closeModal();
            this.renderCalendar();
            this.renderEntriesList();
            this.renderDeckView();
        }
    }

    async deleteEntry(id) {
        if (!confirm('Are you sure you want to delete this journal entry?')) return;

        try {
            const response = await fetch(`http://localhost:3000/api/journals/${id}`, {
                method: 'DELETE'
            });
            if (!response.ok) throw new Error('API delete failed');

            this.journals = this.journals.filter(j => j.id !== id);
            Storage.set('dsa_journals', this.journals);
            Toast.show('Journal entry deleted.', 'info');
            this.closeModal();
            this.renderCalendar();
            this.renderEntriesList();
            this.renderDeckView();
        } catch (e) {
            console.warn('Backend delete failed, updating local storage:', e);
            this.journals = this.journals.filter(j => j.id !== id);
            Storage.set('dsa_journals', this.journals);
            Toast.show('Journal entry deleted locally.', 'info');
            this.closeModal();
            this.renderCalendar();
            this.renderEntriesList();
            this.renderDeckView();
        }
    }

    switchView(mode) {
        this.activeView = mode;
        const gridView = document.getElementById('journal-grid-view');
        const deckView = document.getElementById('journal-deck-view');

        if (mode === 'grid') {
            if (gridView) gridView.classList.remove('hidden');
            if (deckView) deckView.classList.add('hidden');
            if (this.btnViewGrid) this.btnViewGrid.classList.add('active');
            if (this.btnViewDeck) this.btnViewDeck.classList.remove('active');
        } else {
            if (gridView) gridView.classList.add('hidden');
            if (deckView) deckView.classList.remove('hidden');
            if (this.btnViewGrid) this.btnViewGrid.classList.remove('active');
            if (this.btnViewDeck) this.btnViewDeck.classList.add('active');
            this.renderDeckView();
        }
    }

    renderDeckView() {
        if (!this.deckTrack || !this.deckCounterBadge || !this.deckPaginationBar) return;

        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const todayStr = this.getTodayDateStr();

        const journalMap = {};
        (this.journals || []).forEach(j => {
            if (j.date) {
                if (!journalMap[j.date]) journalMap[j.date] = [];
                journalMap[j.date].push(j);
            }
        });

        let allCards = [];
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayObj = new Date(this.currentYear, this.currentMonth, day);
            const entries = journalMap[dateStr] || [];
            allCards.push({
                day,
                dateStr,
                dayObj,
                entries,
                isToday: dateStr === todayStr
            });
        }

        if (this.deckFilter === 'entries') {
            allCards = allCards.filter(c => c.entries.length > 0);
        }

        this.deckCards = allCards;

        if (allCards.length === 0) {
            this.deckTrack.innerHTML = '<div class="card-empty-prompt"><span class="empty-icon">📭</span><p>No entries found for this month.</p></div>';
            this.deckCounterBadge.textContent = '0 cards';
            this.deckPaginationBar.innerHTML = '';
            this.updateAmbientGlow(null);
            return;
        }

        if (this.deckIndex >= allCards.length) this.deckIndex = allCards.length - 1;
        if (this.deckIndex < 0) this.deckIndex = 0;

        const todayIdx = allCards.findIndex(c => c.isToday);
        if (todayIdx >= 0 && this.deckIndex === 0 && !this._deckUserNavigated) {
            this.deckIndex = todayIdx;
        }

        this.deckScrollTarget = this.deckIndex;
        this.deckScrollCurrent = this.deckIndex;

        const currentActiveCard = allCards[this.deckIndex];
        this.updateAmbientGlow(currentActiveCard);

        const palettes = [
            { bg: '#facc15', ink: '#1c1917', muted: '#44403c', accent: '#dc2626', icon: '🥨' },
            { bg: '#ec4899', ink: '#ffffff', muted: '#fbcfe8', accent: '#fef08a', icon: '🥧' },
            { bg: '#451a03', ink: '#fef08a', muted: '#f59e0b', accent: '#d97706', icon: '🧁' },
            { bg: '#06b6d4', ink: '#0f172a', muted: '#1e293b', accent: '#ffffff', icon: '🥪' },
            { bg: '#10b981', ink: '#064e3b', muted: '#047857', accent: '#fef08a', icon: '🍃' },
            { bg: '#8b5cf6', ink: '#ffffff', muted: '#ddd6fe', accent: '#facc15', icon: '🔮' },
            { bg: '#f97316', ink: '#ffffff', muted: '#ffedd5', accent: '#fef08a', icon: '🔥' }
        ];

        let cardsHTML = '';
        allCards.forEach((card, i) => {
            const isActive = i === this.deckIndex;
            const p = palettes[card.day % palettes.length];
            const dayOfWeek = dayNames[card.dayObj.getDay()];
            const monthName = monthNames[this.currentMonth];
            const hasEntry = card.entries.length > 0;
            const latest = hasEntry ? card.entries[0] : null;

            const dateHeaderTitle = `${dayOfWeek.substring(0, 3)}, ${monthName.substring(0, 3)} ${card.day}`;

            let statusTag = '';
            if (card.isToday) {
                statusTag = '<span class="card-status-pill is-today">TODAY</span>';
            } else if (hasEntry) {
                statusTag = '<span class="card-status-pill">WRITTEN</span>';
            } else {
                statusTag = '<span class="card-status-pill">EMPTY</span>';
            }

            let entryTitle = hasEntry ? (latest.title || 'Journal Reflection') : 'Daily Scratchpad Reflection';
            let snippetText = hasEntry ? (latest.content || '') : 'No journal entry recorded for this date yet. Tap to record your thoughts & progress...';
            let wordCount = hasEntry ? (latest.content ? latest.content.trim().split(/\s+/).length : 0) : 0;
            let wordCountStr = hasEntry ? `${wordCount} ${wordCount === 1 ? 'word' : 'words'}` : 'Empty entry';

            cardsHTML += `
                <article class="journal-deck-card ${isActive ? 'is-active' : ''}" 
                         data-deck-index="${i}" 
                         data-date="${card.dateStr}"
                         style="background: ${p.bg}; color: ${p.ink};">
                    <div class="deck-card-topbar">
                        <div class="deck-card-date">
                            <span class="date-icon">${p.icon}</span>
                            <span class="date-str">${dateHeaderTitle}</span>
                        </div>
                        ${statusTag}
                    </div>

                    <div class="deck-card-body clickable-card-body" data-action="open-modal" data-date="${card.dateStr}">
                        <h3 class="deck-card-title" style="color: ${p.ink}">${this.escapeHTML(entryTitle)}</h3>
                        <p class="deck-card-snippet" style="color: ${p.muted}">${this.escapeHTML(snippetText)}</p>
                    </div>

                    <div class="deck-card-footer" style="border-color: rgba(255,255,255,0.2)">
                        <span class="deck-card-meta" style="color: ${p.muted}">✍️ ${wordCountStr}</span>
                        <button type="button" class="card-action-btn write-note-btn" data-action="open-modal" data-date="${card.dateStr}" style="background: ${p.ink}; color: ${p.bg}">
                            ${hasEntry ? '✏️ Edit Note' : '➕ Write Note'}
                        </button>
                    </div>
                </article>
            `;
        });

        this.deckTrack.innerHTML = cardsHTML;

        // Bind Deck Card Click Listeners (Card Body & Write Note Button)
        this.deckTrack.querySelectorAll('[data-action="open-modal"]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetDate = el.getAttribute('data-date');
                if (targetDate) {
                    this.openModalForDate(targetDate);
                }
            });
        });

        this.updateDeckCounterAndPagination();
        this.startDeckAnimationLoop();
    }

    navigateDeck(direction) {
        if (!this.deckCards || this.deckCards.length === 0) return;
        const newIdx = Math.max(0, Math.min(this.deckCards.length - 1, this.deckIndex + direction));
        if (newIdx !== this.deckIndex) {
            this.deckIndex = newIdx;
            this.deckScrollTarget = newIdx;
            this._deckUserNavigated = true;
            this.updateDeckCounterAndPagination();
        }
    }

    updateDeckCounterAndPagination() {
        if (!this.deckCards || this.deckCards.length === 0) return;
        const currentIdx = Math.max(0, Math.min(this.deckCards.length - 1, Math.round(this.deckScrollCurrent)));

        if (this.deckCounterBadge) {
            this.deckCounterBadge.textContent = `${currentIdx + 1} of ${this.deckCards.length}`;
        }

        if (this.deckPaginationBar) {
            let dotsHTML = '';
            const total = this.deckCards.length;
            for (let i = 0; i < total; i++) {
                const isActive = i === currentIdx;
                dotsHTML += `<button type="button" class="deck-page-dot ${isActive ? 'active' : ''}" data-index="${i}" title="Card ${i + 1}"></button>`;
            }
            this.deckPaginationBar.innerHTML = dotsHTML;

            this.deckPaginationBar.querySelectorAll('.deck-page-dot').forEach(dot => {
                dot.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = parseInt(dot.getAttribute('data-index'), 10);
                    if (!isNaN(idx)) {
                        this.deckIndex = idx;
                        this.deckScrollTarget = idx;
                        this._deckUserNavigated = true;
                        this.updateDeckCounterAndPagination();
                    }
                });
            });
        }

        if (this.deckCards[currentIdx]) {
            this.updateAmbientGlow(this.deckCards[currentIdx]);
        }
    }

    updateAmbientGlow(card) {
        if (!this.deckAmbientGlow) return;
        if (!card) {
            this.deckAmbientGlow.style.opacity = '0';
            return;
        }
        const palettes = [
            '#facc15', '#ec4899', '#f59e0b', '#06b6d4', '#10b981', '#8b5cf6', '#f97316'
        ];
        const color = palettes[card.day % palettes.length];
        this.deckAmbientGlow.style.background = `radial-gradient(circle at center, ${color}33 0%, transparent 70%)`;
        this.deckAmbientGlow.style.opacity = '1';
    }

    startDeckAnimationLoop() {
        if (this._deckLoopRunning) return;
        this._deckLoopRunning = true;

        const step = () => {
            if (this.activeView === 'deck' && this.deckCards && this.deckCards.length > 0) {
                const scrollDiff = this.deckScrollTarget - this.deckScrollCurrent;
                if (Math.abs(scrollDiff) > 0.0001) {
                    this.deckScrollCurrent += scrollDiff * 0.14;
                } else {
                    this.deckScrollCurrent = this.deckScrollTarget;
                }

                const tiltDiffX = this.deckTiltTargetX - this.deckTiltCurrentX;
                const tiltDiffY = this.deckTiltTargetY - this.deckTiltCurrentY;
                if (Math.abs(tiltDiffX) > 0.01 || Math.abs(tiltDiffY) > 0.01) {
                    this.deckTiltCurrentX += tiltDiffX * 0.12;
                    this.deckTiltCurrentY += tiltDiffY * 0.12;
                } else {
                    this.deckTiltCurrentX = this.deckTiltTargetX;
                    this.deckTiltCurrentY = this.deckTiltTargetY;
                }

                this.updateDeckTransformsRealtime();
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    updateDeckTransformsRealtime() {
        if (!this.deckTrack) return;
        const cardElements = this.deckTrack.querySelectorAll('.journal-deck-card');

        cardElements.forEach(cardEl => {
            const idx = parseInt(cardEl.getAttribute('data-deck-index'), 10);
            if (isNaN(idx)) return;

            const offset = idx - this.deckScrollCurrent;
            const absOffset = Math.abs(offset);
            const dir = offset > 0 ? 1 : -1;

            const translateX = offset * 135;
            const translateZ = -absOffset * 85;
            const rotateYCurve = -dir * Math.min(18, absOffset * 9);
            const scale = Math.max(0.7, 1 - absOffset * 0.08);
            const opacity = Math.max(0, 1 - absOffset * 0.25);

            const rotX = (absOffset < 0.5) ? this.deckTiltCurrentX : 0;
            const rotY = (absOffset < 0.5) ? (rotateYCurve + this.deckTiltCurrentY) : rotateYCurve;

            cardEl.style.transform = `translate(-50%, -50%) translateX(${translateX}px) translateZ(${translateZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`;
            cardEl.style.opacity = opacity.toFixed(3);

            const isCardActive = absOffset < 0.5;
            const zIndex = isCardActive ? 1000 : Math.round(500 - absOffset * 20);
            cardEl.style.zIndex = zIndex;

            if (isCardActive) {
                cardEl.classList.add('is-active');
            } else {
                cardEl.classList.remove('is-active');
            }
        });
    }

    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    Toast.init();
    window.dsaApp = new App();
});