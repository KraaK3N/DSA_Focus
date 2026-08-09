/**
 * ============================================================
 *  DSA Focus Dashboard — Main Application Script
 * ============================================================
 */

// Global fail-safe helper to open journal modal from anywhere (inline onclicks, console, buttons)
window.openJournalModal = function(dateStr) {
    if (window.dsaApp) {
        if (typeof window.dsaApp.switchTab === 'function') {
            window.dsaApp.switchTab('journal');
        }
        if (window.dsaApp.journalManager) {
            const targetDate = dateStr || window.dsaApp.journalManager.getTodayDateStr();
            window.dsaApp.journalManager.openModalForDate(targetDate);
        }
    }
};

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

        // SVG Ring circumference setup
        this.radius = (this.ring && this.ring.r && this.ring.r.baseVal && this.ring.r.baseVal.value) ? this.ring.r.baseVal.value : 96;
        this.circumference = 2 * Math.PI * this.radius;
        if (this.ring) {
            this.ring.style.strokeDasharray = this.circumference;
        }

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
        this.targetTotalProblems = 474;
        this.externalSolvedOffset = 0;
        this.paceWindowDays = 7;
        this.paceWeightedMode = false;

        // View Management (Dashboard vs Spreadsheet Log)
        this.activeTab = 'dashboard';
        
        this.bindForms();
        this.bindShortcuts();
        this.bindTabs();
        this.bindFilters();
        this.bindTheme();
        this.bindNotesSidebar();
        this.bindQuickEditModal();
        this.bindGoalEvents();
        this.bindCSVImport();
        this.bindConflictModalEvents();
        this.bindPaceEvents();
        
        // Initialize Journal Manager
        this.journalManager = new JournalManager(this);
        
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
        await this.loadPaceSettings();
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
        const cancelBtn = document.getElementById('notes-modal-cancel');
        const saveBtn = document.getElementById('notes-modal-save');
        const textarea = document.getElementById('notes-modal-textarea');

        const closeModal = () => {
            sidebar.classList.remove('active');
            backdrop.classList.remove('active');
            document.body.classList.remove('body-scroll-locked');
            setTimeout(() => {
                sidebar.classList.add('hidden');
                backdrop.classList.add('hidden');
            }, 250);
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (backdrop) backdrop.addEventListener('click', closeModal);

        // Click outside modal card (on sidebar overlay background) to close popup
        if (sidebar) {
            sidebar.addEventListener('click', (e) => {
                if (e.target === sidebar) {
                    closeModal();
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                if (this.currentEditingProblemId) {
                    const newNotes = textarea ? textarea.value.trim() : '';
                    const problem = this.problems.find(p => p.id === this.currentEditingProblemId);
                    if (problem) {
                        problem.notes = newNotes;
                        Storage.set('dsa_problems', this.problems);
                        this.saveProblemToServer(problem, true);
                        this.renderSpreadsheet();
                        this.updateStats();
                        Toast.show(`Notes updated for "${problem.name}" ✓`, 'success');
                    }
                }
                closeModal();
            });
        }

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !sidebar.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    showNotesSidebar(problemName, notes, problemId = null) {
        const sidebar = document.getElementById('notes-sidebar');
        const backdrop = document.getElementById('notes-sidebar-backdrop');
        const titleEl = document.getElementById('notes-sidebar-title');
        const textarea = document.getElementById('notes-modal-textarea');

        this.currentEditingProblemId = problemId;
        if (titleEl) titleEl.textContent = problemName;
        if (textarea) textarea.value = notes || '';

        // Show elements (make visible in layout)
        sidebar.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        document.body.classList.add('body-scroll-locked');

        // Trigger CSS transition animation
        setTimeout(() => {
            sidebar.classList.add('active');
            backdrop.classList.add('active');
            if (textarea) textarea.focus();
        }, 10);
    }

    bindQuickEditModal() {
        const modal = document.getElementById('quick-edit-modal');
        const backdrop = document.getElementById('quick-edit-modal-backdrop');
        const closeBtn = document.getElementById('quick-edit-modal-close');
        const cancelBtn = document.getElementById('qe-cancel');
        const form = document.getElementById('quick-edit-form');

        const closeModal = () => {
            if (!modal) return;
            modal.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
            document.body.classList.remove('body-scroll-locked');
            setTimeout(() => {
                modal.classList.add('hidden');
                if (backdrop) backdrop.classList.add('hidden');
            }, 250);
        };

        this.closeQuickEditModal = closeModal;

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (backdrop) backdrop.addEventListener('click', closeModal);

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const qeId = document.getElementById('qe-id').value;
                const problem = this.problems.find(p => p.id === qeId);
                if (!problem) {
                    closeModal();
                    return;
                }

                const nameInput = document.getElementById('qe-name');
                if (!nameInput.value.trim()) {
                    Toast.show('Problem name is required!', 'error');
                    nameInput.focus();
                    return;
                }

                const timeSpentInput = document.getElementById('qe-time').value.trim() || '0m';
                const timeSecs = this.parseTimeStringToSeconds(timeSpentInput);

                problem.date = document.getElementById('qe-date').value || problem.date;
                problem.name = nameInput.value.trim();
                problem.url = document.getElementById('qe-url').value.trim();
                problem.platform = document.getElementById('qe-platform').value.trim() || 'N/A';
                problem.difficulty = document.getElementById('qe-difficulty').value;
                problem.topic = document.getElementById('qe-topic').value.trim() || 'General';
                problem.notes = document.getElementById('qe-notes').value.trim();
                problem.hintUsed = document.getElementById('qe-hint').checked;
                problem.independent = document.getElementById('qe-independent').checked;
                problem.needsRevision = document.getElementById('qe-revision').checked;
                problem.timeSpent = timeSpentInput;
                problem.timeSeconds = timeSecs;

                // Save locally
                Storage.set('dsa_problems', this.problems);

                // Save to backend database
                this.saveProblemToServer(problem, true);

                // Update UI & Stats
                this.renderSpreadsheet();
                this.updateStats();

                Toast.show(`Updated entry "${problem.name}" ✓`, 'success');
                closeModal();
            });
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                closeModal();
            }
        });
    }

    showQuickEditModal(id) {
        const problem = this.problems.find(p => p.id === id);
        if (!problem) return;

        const modal = document.getElementById('quick-edit-modal');
        const backdrop = document.getElementById('quick-edit-modal-backdrop');
        if (!modal || !backdrop) return;

        document.getElementById('qe-id').value = problem.id;
        document.getElementById('qe-date').value = problem.date || '';
        document.getElementById('qe-time').value = problem.timeSpent || '0m';
        document.getElementById('qe-name').value = problem.name || '';
        document.getElementById('qe-url').value = problem.url || '';
        document.getElementById('qe-platform').value = problem.platform || '';
        document.getElementById('qe-difficulty').value = problem.difficulty || 'Medium';
        document.getElementById('qe-topic').value = problem.topic || '';
        document.getElementById('qe-hint').checked = !!problem.hintUsed;
        document.getElementById('qe-independent').checked = !!problem.independent;
        document.getElementById('qe-revision').checked = !!problem.needsRevision;
        document.getElementById('qe-notes').value = problem.notes || '';

        modal.classList.remove('hidden');
        backdrop.classList.remove('hidden');
        document.body.classList.add('body-scroll-locked');

        setTimeout(() => {
            modal.classList.add('active');
            backdrop.classList.add('active');
            const nameEl = document.getElementById('qe-name');
            if (nameEl) nameEl.focus();
        }, 10);
    }

    parseTimeStringToSeconds(str) {
        if (!str) return 0;
        str = str.trim();
        let totalSecs = 0;
        const hMatch = str.match(/(\d+)\s*h/i);
        const mMatch = str.match(/(\d+)\s*m/i);
        const sMatch = str.match(/(\d+)\s*s/i);
        if (hMatch) totalSecs += parseInt(hMatch[1], 10) * 3600;
        if (mMatch) totalSecs += parseInt(mMatch[1], 10) * 60;
        if (sMatch) totalSecs += parseInt(sMatch[1], 10);
        if (!hMatch && !mMatch && !sMatch) {
            const num = parseInt(str, 10);
            if (!isNaN(num)) totalSecs = num * 60;
        }
        return totalSecs;
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
        const tabJournal = document.getElementById('tab-journal');

        if (tabDashboard) tabDashboard.addEventListener('click', () => this.switchTab('dashboard'));
        if (tabLog) tabLog.addEventListener('click', () => this.switchTab('log'));
        if (tabJournal) tabJournal.addEventListener('click', () => this.switchTab('journal'));
    }

    switchTab(tabName) {
        if (this.activeTab === tabName) return;
        this.activeTab = tabName;

        const tabDashboard = document.getElementById('tab-dashboard');
        const tabLog = document.getElementById('tab-log');
        const tabJournal = document.getElementById('tab-journal');

        const viewDashboard = document.getElementById('dashboard-view');
        const viewLog = document.getElementById('log-view');
        const viewJournal = document.getElementById('journal-view');
        const paceSection = document.getElementById('pace-section');

        if (tabDashboard) tabDashboard.classList.remove('active');
        if (tabLog) tabLog.classList.remove('active');
        if (tabJournal) tabJournal.classList.remove('active');

        if (viewDashboard) viewDashboard.classList.add('hidden');
        if (viewLog) viewLog.classList.add('hidden');
        if (viewJournal) viewJournal.classList.add('hidden');
        if (paceSection) paceSection.classList.add('hidden');

        if (tabName === 'dashboard') {
            if (tabDashboard) tabDashboard.classList.add('active');
            if (viewDashboard) viewDashboard.classList.remove('hidden');
            if (paceSection) paceSection.classList.remove('hidden');
        } else if (tabName === 'log') {
            if (tabLog) tabLog.classList.add('active');
            if (viewLog) viewLog.classList.remove('hidden');
            this.renderSpreadsheet();
        } else if (tabName === 'journal') {
            if (tabJournal) tabJournal.classList.add('active');
            if (viewJournal) viewJournal.classList.remove('hidden');
            if (this.journalManager) {
                this.journalManager.renderCalendar();
                this.journalManager.renderEntriesList();
                if (this.journalManager.activeView === 'deck') {
                    this.journalManager.renderDeckView();
                }
            }
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
        if (!themeBtn) return;

        const updateThemeUI = (isDark) => {
            if (isDark) {
                document.body.classList.add('dark-theme');
                themeBtn.innerHTML = `<svg class="theme-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg><span class="theme-text">Light</span>`;
            } else {
                document.body.classList.remove('dark-theme');
                themeBtn.innerHTML = `<svg class="theme-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg><span class="theme-text">Dark</span>`;
            }
        };

        const isDark = Storage.get('dark_theme_active') === true;
        updateThemeUI(isDark);

        themeBtn.addEventListener('click', () => {
            const currentlyDark = document.body.classList.contains('dark-theme');
            if (currentlyDark) {
                updateThemeUI(false);
                Storage.set('dark_theme_active', false);
                Toast.show('Switched to light theme', 'info');
            } else {
                updateThemeUI(true);
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

        // Use local date (not UTC) so IST dates are always correct
        const _now = new Date();
        const _localDate = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`;

        const problemData = {
            id: this.editingId || Date.now().toString(),
            date: _localDate,
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
        const btnSave = document.getElementById('btn-save-problem');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = 'Saving...';
        }

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
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.textContent = 'Save Problem';
            }
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
                (p.name || '').toLowerCase().includes(query) ||
                (p.platform || '').toLowerCase().includes(query) ||
                (p.topic || '').toLowerCase().includes(query) ||
                (p.notes || '').toLowerCase().includes(query);

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
                        <button class="table-edit-btn" data-id="${p.id}" title="Quick Edit Entry">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            <span>Edit</span>
                        </button>
                        <button class="table-delete-btn" data-id="${p.id}" title="Delete Log Entry">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            <span>Delete</span>
                        </button>
                    </div>
                </td>
            `;

            tr.addEventListener('dblclick', (e) => {
                if (e.target.closest('a') || e.target.closest('button')) return;
                this.showQuickEditModal(p.id);
            });

            const notesCell = tr.querySelector('.notes-cell');
            if (notesCell) {
                notesCell.addEventListener('click', () => {
                    this.showNotesSidebar(p.name, p.notes || '', p.id);
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
                this.showQuickEditModal(e.currentTarget.dataset.id);
            });
        });
    }

    exportCSV() {
        if (this.problems.length === 0) {
            Toast.show('No problem data to export!', 'error');
            return;
        }

        const headers = [
            "Date", "Problem Name", "URL", "Platform", "Difficulty", 
            "Topic", "Time Spent", "Hint Used", "Solved Independently", 
            "Revision Required", "Notes"
        ];

        const escapeCell = (val) => {
            if (val === undefined || val === null) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const rows = [headers.join(",")];

        this.problems.forEach(p => {
            const row = [
                escapeCell(p.date),
                escapeCell(p.name),
                escapeCell(p.url || ''),
                escapeCell(p.platform || 'N/A'),
                escapeCell(p.difficulty),
                escapeCell(p.topic || 'General'),
                escapeCell(p.timeSpent || '0s'),
                escapeCell(p.hintUsed ? "Yes" : "No"),
                escapeCell(p.independent ? "Yes" : "No"),
                escapeCell(p.needsRevision ? "Yes" : "No"),
                escapeCell(p.notes || '')
            ];
            rows.push(row.join(","));
        });

        const csvString = rows.join("\r\n");
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const today = new Date().toISOString().split('T')[0];

        link.setAttribute("href", url);
        link.setAttribute("download", `dsa_problems_export_${today}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        Toast.show('CSV Export downloaded!', 'success');
    }

    /* ─── CSV Import & Conflict Resolution ───────────────────── */

    bindCSVImport() {
        const btnImport = document.getElementById('btn-import-csv');
        const fileInput = document.getElementById('csv-file-input');

        if (!btnImport || !fileInput) return;

        btnImport.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            this.handleCSVUpload(e);
        });
    }

    handleCSVUpload(e) {
        const file = e.target.files && e.target.files[0];
        // Reset file input value so the same file can be uploaded again if needed
        e.target.value = '';

        if (!file) return;

        // 1. Extension validation
        if (!file.name.toLowerCase().endsWith('.csv')) {
            Toast.show('Invalid file format. Please upload a .csv file.', 'error');
            return;
        }

        // 2. File size validation (5MB max)
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            Toast.show('File size exceeds the 5MB limit.', 'error');
            return;
        }

        // 3. Empty file check
        if (file.size === 0) {
            Toast.show('The selected CSV file is empty.', 'error');
            return;
        }

        // 4. Parsing with PapaParse (or fallback custom parser)
        if (window.Papa) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: 'greedy',
                complete: (results) => {
                    if (results.errors && results.errors.length > 0 && (!results.data || results.data.length === 0)) {
                        console.error('PapaParse errors:', results.errors);
                        Toast.show('Failed to parse CSV file structure.', 'error');
                        return;
                    }
                    this.processImportRows(results.data);
                },
                error: (err) => {
                    console.error('PapaParse execution error:', err);
                    Toast.show('Error reading CSV file: ' + err.message, 'error');
                }
            });
        } else {
            // Fallback robust parser if Papa is offline
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const rows = this.parseCSVText(evt.target.result);
                    this.processImportRows(rows);
                } catch (err) {
                    console.error('Fallback parse error:', err);
                    Toast.show('Error parsing CSV file: ' + err.message, 'error');
                }
            };
            reader.onerror = () => Toast.show('Failed to read CSV file.', 'error');
            reader.readAsText(file);
        }
    }

    processImportRows(rows) {
        if (!rows || rows.length === 0) {
            Toast.show('No rows found in the CSV file.', 'error');
            return;
        }

        const getVal = (row, possibleKeys) => {
            for (const k of Object.keys(row)) {
                const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const pk of possibleKeys) {
                    if (cleanKey === pk.toLowerCase().replace(/[^a-z0-9]/g, '')) {
                        return row[k];
                    }
                }
            }
            return undefined;
        };

        // Header validation: check if required 'name' or 'Problem Name' header is present
        const sampleRow = rows[0] || {};
        const hasNameHeader = getVal(sampleRow, ['name', 'problem name', 'problem_name', 'title', 'problem']) !== undefined;

        if (!hasNameHeader) {
            Toast.show('Invalid CSV format: Missing required header "Problem Name" or "name".', 'error');
            return;
        }

        const parsedProblems = [];
        const parseBool = (v, defaultVal = false) => {
            if (v === undefined || v === null || v === '') return defaultVal;
            const s = String(v).trim().toLowerCase();
            return s === 'yes' || s === 'true' || s === '1' || s === 'y';
        };

        rows.forEach((r, idx) => {
            const nameVal = getVal(r, ['name', 'problem name', 'problem_name', 'title', 'problem']);
            if (!nameVal || !String(nameVal).trim()) return; // skip rows with empty problem name

            const dateVal = getVal(r, ['date', 'date logged', 'created_at']);
            const urlVal = getVal(r, ['url', 'link', 'problem url', 'problem link']);
            const platformVal = getVal(r, ['platform', 'site']);
            const difficultyVal = getVal(r, ['difficulty', 'diff']);
            const topicVal = getVal(r, ['topic', 'category', 'tags']);
            const notesVal = getVal(r, ['notes', 'note', 'description', 'solution']);
            const timeSpentVal = getVal(r, ['time spent', 'timespent', 'time_spent', 'duration']);
            const hintVal = getVal(r, ['hint used', 'hintused', 'hint_used', 'hint']);
            const soloVal = getVal(r, ['solved independently', 'independent', 'solved_independently', 'solo']);
            const revisionVal = getVal(r, ['revision required', 'needsrevision', 'revision_required', 'revision', 'revise']);

            const timeSpentStr = timeSpentVal ? String(timeSpentVal).trim() : '0s';
            const timeSecs = this.parseSecondsFromFormatted(timeSpentStr);

            let diffStr = difficultyVal ? String(difficultyVal).trim() : 'Medium';
            diffStr = this.capitalize(diffStr);
            if (!['Easy', 'Medium', 'Hard'].includes(diffStr)) {
                diffStr = 'Medium';
            }

            parsedProblems.push({
                id: 'imp_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 5),
                date: (dateVal && String(dateVal).trim()) ? String(dateVal).trim() : new Date().toISOString().split('T')[0],
                name: String(nameVal).trim(),
                url: urlVal ? String(urlVal).trim() : '',
                platform: (platformVal && String(platformVal).trim()) ? String(platformVal).trim() : 'N/A',
                difficulty: diffStr,
                topic: (topicVal && String(topicVal).trim()) ? String(topicVal).trim() : 'General',
                notes: notesVal ? String(notesVal).trim() : '',
                hintUsed: parseBool(hintVal, false),
                independent: parseBool(soloVal, true),
                needsRevision: parseBool(revisionVal, false),
                timeSpent: timeSpentStr,
                timeSeconds: timeSecs
            });
        });

        if (parsedProblems.length === 0) {
            Toast.show('No valid problem records found in CSV file.', 'error');
            return;
        }

        this.detectDuplicatesAndImport(parsedProblems);
    }

    detectDuplicatesAndImport(importedProblems) {
        const stagedNonConflicting = [];
        const conflicts = [];

        importedProblems.forEach(imported => {
            const importedUrl = imported.url ? imported.url.trim().toLowerCase() : '';
            const importedName = imported.name.trim().toLowerCase();
            const importedPlatform = imported.platform.trim().toLowerCase();

            const existingMatch = this.problems.find(existing => {
                const existingUrl = existing.url ? existing.url.trim().toLowerCase() : '';
                const existingName = existing.name.trim().toLowerCase();
                const existingPlatform = existing.platform.trim().toLowerCase();

                // Match Criteria (Requirement A):
                // 1. Exact match on url (if present and non-empty), OR
                // 2. Exact match on (name + platform) case-insensitively
                const hasUrlMatch = importedUrl.length > 0 && existingUrl.length > 0 && importedUrl === existingUrl;
                const hasNamePlatformMatch = importedName === existingName && importedPlatform === existingPlatform;

                return hasUrlMatch || hasNamePlatformMatch;
            });

            if (existingMatch) {
                conflicts.push({ existing: existingMatch, imported });
            } else {
                stagedNonConflicting.push({ action: 'insert', problem: imported });
            }
        });

        if (conflicts.length === 0) {
            // All records non-conflicting, automatically persist
            this.executeBatchImport(stagedNonConflicting);
        } else {
            // Present Windows-Style Conflict Resolution Modal
            this.openConflictResolutionModal(stagedNonConflicting, conflicts);
        }
    }

    /* ─── Windows-Style Conflict Resolution Controller ─────────── */

    bindConflictModalEvents() {
        const btnKeepExisting = document.getElementById('btn-keep-existing');
        const btnReplaceImported = document.getElementById('btn-replace-imported');
        const btnKeepBoth = document.getElementById('btn-keep-both');

        const btnSkipConflict = document.getElementById('btn-skip-conflict');
        const btnUndoConflict = document.getElementById('btn-undo-conflict');

        const btnSkipAll = document.getElementById('btn-skip-all');
        const btnReplaceAll = document.getElementById('btn-replace-all');
        const btnKeepAll = document.getElementById('btn-keep-all');

        const btnCancelModal = document.getElementById('btn-cancel-conflict-modal');
        const btnCancelModalSummary = document.getElementById('btn-cancel-conflict-modal-summary');
        const btnCancelImport = document.getElementById('btn-cancel-import');

        const btnReviewSkipped = document.getElementById('btn-review-skipped');
        const btnCommitImport = document.getElementById('btn-commit-import');

        if (btnKeepExisting) btnKeepExisting.addEventListener('click', () => this.resolveConflict('skip'));
        if (btnReplaceImported) btnReplaceImported.addEventListener('click', () => this.resolveConflict('update'));
        if (btnKeepBoth) btnKeepBoth.addEventListener('click', () => this.resolveConflict('insert'));

        if (btnSkipConflict) btnSkipConflict.addEventListener('click', () => this.skipCurrentConflict());
        if (btnUndoConflict) btnUndoConflict.addEventListener('click', () => this.undoLastConflict());

        if (btnSkipAll) btnSkipAll.addEventListener('click', () => this.batchResolveAll('skip'));
        if (btnReplaceAll) btnReplaceAll.addEventListener('click', () => this.batchResolveAll('update'));
        if (btnKeepAll) btnKeepAll.addEventListener('click', () => this.batchResolveAll('insert'));

        if (btnCancelModal) btnCancelModal.addEventListener('click', () => this.cancelConflictResolution());
        if (btnCancelModalSummary) btnCancelModalSummary.addEventListener('click', () => this.cancelConflictResolution());
        if (btnCancelImport) btnCancelImport.addEventListener('click', () => this.cancelConflictResolution());

        if (btnReviewSkipped) btnReviewSkipped.addEventListener('click', () => this.reviewSkippedConflicts());
        if (btnCommitImport) btnCommitImport.addEventListener('click', () => this.finalizeConflictResolution());

        const toggleHideSame = document.getElementById('conflict-toggle-hide-same');
        if (toggleHideSame) {
            toggleHideSame.addEventListener('change', () => {
                this.renderCurrentConflict();
            });
        }

        // Focus ring navigation index for keyboard
        this.actionButtonFocusIdx = 0;
        const actionButtons = [btnKeepExisting, btnReplaceImported, btnKeepBoth].filter(Boolean);

        const updateFocusState = () => {
            actionButtons.forEach((btn, idx) => {
                if (idx === this.actionButtonFocusIdx) {
                    btn.classList.add('is-keyboard-focus');
                    btn.focus();
                } else {
                    btn.classList.remove('is-keyboard-focus');
                }
            });
        };

        window.addEventListener('keydown', (e) => {
            const modal = document.getElementById('conflict-modal');
            if (!modal || modal.classList.contains('hidden')) return;

            const activeView = document.getElementById('conflict-active-view');
            const summaryView = document.getElementById('conflict-summary-view');

            if (summaryView && !summaryView.classList.contains('hidden')) {
                if (e.key === 'Escape') {
                    this.cancelConflictResolution();
                } else if (e.key === 'Enter') {
                    this.finalizeConflictResolution();
                }
                return;
            }

            if (!activeView || activeView.classList.contains('hidden')) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                this.skipCurrentConflict();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const currentFocusedBtn = actionButtons[this.actionButtonFocusIdx] || btnKeepExisting;
                currentFocusedBtn.click();
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.actionButtonFocusIdx = (this.actionButtonFocusIdx + 1) % actionButtons.length;
                updateFocusState();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.actionButtonFocusIdx = (this.actionButtonFocusIdx - 1 + actionButtons.length) % actionButtons.length;
                updateFocusState();
            }
        });
    }

    cancelConflictResolution() {
        const modal = document.getElementById('conflict-modal');
        if (modal) modal.classList.add('hidden');
        this.conflictState = null;
        Toast.show('CSV import process cancelled.', 'info');
    }

    openConflictResolutionModal(staged, rawConflicts) {
        const computedQueue = rawConflicts.map(pair => {
            const diffFields = [];
            const fieldsToCompare = [
                'date', 'name', 'platform', 'difficulty', 'topic',
                'url', 'timeSpent', 'hintUsed', 'independent', 'needsRevision', 'notes'
            ];

            fieldsToCompare.forEach(f => {
                let v1 = pair.existing[f];
                let v2 = pair.imported[f];
                if (f === 'hintUsed' || f === 'independent' || f === 'needsRevision') {
                    v1 = !!v1;
                    v2 = !!v2;
                }
                const str1 = String(v1 !== undefined && v1 !== null ? v1 : '').trim().toLowerCase();
                const str2 = String(v2 !== undefined && v2 !== null ? v2 : '').trim().toLowerCase();
                if (str1 !== str2) {
                    diffFields.push(f);
                }
            });

            return {
                existing: pair.existing,
                imported: pair.imported,
                diffFields: diffFields,
                status: 'pending' // 'pending' | 'resolved' | 'skipped'
            };
        });

        this.conflictState = {
            staged: staged,
            queue: computedQueue,
            totalCount: computedQueue.length,
            index: 0,
            history: [],
            resolutions: []
        };

        const applyAllChk = document.getElementById('conflict-apply-all');
        if (applyAllChk) applyAllChk.checked = false;

        const activeView = document.getElementById('conflict-active-view');
        const summaryView = document.getElementById('conflict-summary-view');
        if (activeView) activeView.classList.remove('hidden');
        if (summaryView) summaryView.classList.add('hidden');

        const modal = document.getElementById('conflict-modal');
        if (modal) modal.classList.remove('hidden');

        this.actionButtonFocusIdx = 0;
        this.renderCurrentConflict();
    }

    renderCurrentConflict() {
        if (!this.conflictState) return;
        const { queue, index, history } = this.conflictState;

        if (index >= queue.length) {
            this.showConflictSummary();
            return;
        }

        const counterEl = document.getElementById('conflict-counter');
        const diffBadgeEl = document.getElementById('conflict-diff-count-badge');
        const progressBarEl = document.getElementById('conflict-progress-bar');
        const summaryTextEl = document.getElementById('conflict-summary-text');
        const btnUndo = document.getElementById('btn-undo-conflict');

        const existingDetailsEl = document.getElementById('conflict-existing-details');
        const importedDetailsEl = document.getElementById('conflict-imported-details');

        const pair = queue[index];

        if (counterEl) {
            counterEl.textContent = `Conflict ${index + 1} of ${queue.length}`;
        }

        if (progressBarEl) {
            const pct = Math.round(((index) / queue.length) * 100);
            progressBarEl.style.width = `${pct}%`;
        }

        if (diffBadgeEl) {
            const diffCount = pair.diffFields.length;
            diffBadgeEl.textContent = `${diffCount} field${diffCount === 1 ? '' : 's'} differ`;
        }

        if (summaryTextEl) {
            summaryTextEl.textContent = `Found ${this.conflictState.totalCount} duplicate problem entries. Choose which version to keep.`;
        }

        if (btnUndo) {
            if (history.length > 0) {
                btnUndo.classList.remove('hidden');
            } else {
                btnUndo.classList.add('hidden');
            }
        }

        if (existingDetailsEl) {
            existingDetailsEl.innerHTML = this.buildConflictCardHtml(pair.existing, pair.imported, pair.diffFields);
        }
        if (importedDetailsEl) {
            importedDetailsEl.innerHTML = this.buildConflictCardHtml(pair.imported, pair.existing, pair.diffFields);
        }

        // Set focus to default action button
        const btnKeepExisting = document.getElementById('btn-keep-existing');
        if (btnKeepExisting) {
            btnKeepExisting.focus();
        }
    }

    buildConflictCardHtml(record, otherRecord, diffFields) {
        const fields = [
            { 
                label: 'Problem', 
                key: 'name', 
                val: record.name, 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' 
            },
            { 
                label: 'Date', 
                key: 'date', 
                val: record.date, 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>' 
            },
            { 
                label: 'Platform', 
                key: 'platform', 
                val: record.platform, 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>' 
            },
            { 
                label: 'Difficulty', 
                key: 'difficulty', 
                val: record.difficulty, 
                isBadge: true, 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>' 
            },
            { 
                label: 'Topic', 
                key: 'topic', 
                val: record.topic || 'General', 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>' 
            },
            { 
                label: 'Time', 
                key: 'timeSpent', 
                val: record.timeSpent || '0s', 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' 
            },
            { 
                label: 'Revision', 
                key: 'needsRevision', 
                val: record.needsRevision ? 'Yes 🔄' : 'No', 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path></svg>' 
            },
            { 
                label: 'Hint Used', 
                key: 'hintUsed', 
                val: record.hintUsed ? 'Yes 💡' : 'No', 
                icon: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 22h4M15.09 14A6 6 0 0 0 18 9a6 6 0 0 0-12 0 6 6 0 0 0 2.91 5"></path></svg>' 
            }
        ];

        // Hide identical fields if toggle enabled (or show differences with distinct styling)
        const hideIdentical = document.getElementById('conflict-toggle-hide-same')?.checked;
        let visibleFields = fields;
        if (hideIdentical) {
            visibleFields = fields.filter(f => diffFields.includes(f.key));
        }

        if (visibleFields.length === 0) {
            return `
                <div class="conflict-all-same-msg">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-easy)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>All key fields match existing record</span>
                </div>
            `;
        }

        return visibleFields.map(f => {
            const isDiff = diffFields.includes(f.key);
            const rowClass = isDiff ? 'is-diff' : 'is-same';

            let valHTML = this.escapeHtml(String(f.val));
            if (f.isBadge) {
                const diffLower = String(f.val).toLowerCase();
                valHTML = `<span class="badge badge-${diffLower}">${this.escapeHtml(String(f.val))}</span>`;
            }

            return `
                <div class="conflict-field-row ${rowClass}">
                    <div class="conflict-field-label">
                        ${f.icon}
                        <span>${f.label}</span>
                    </div>
                    <div class="conflict-field-val" title="${this.escapeHtml(String(f.val))}">${valHTML}</div>
                </div>
            `;
        }).join('');
    }

    resolveConflict(action) {
        if (!this.conflictState) return;

        const applyAll = document.getElementById('conflict-apply-all')?.checked;
        const { queue, index } = this.conflictState;

        if (applyAll) {
            this.batchResolveAll(action);
            return;
        }

        const pair = queue[index];

        // Save state snapshot for Undo
        this.conflictState.history.push({
            index: index,
            pair: pair,
            resolutionsCount: this.conflictState.resolutions.length
        });

        this.addResolution(action, pair);
        pair.status = 'resolved';

        this.conflictState.index++;
        if (this.conflictState.index < queue.length) {
            this.renderCurrentConflict();
        } else {
            this.showConflictSummary();
        }
    }

    skipCurrentConflict() {
        if (!this.conflictState) return;
        const { queue, index } = this.conflictState;

        if (index >= queue.length) return;
        const pair = queue[index];

        this.conflictState.history.push({
            index: index,
            pair: pair,
            resolutionsCount: this.conflictState.resolutions.length
        });

        pair.status = 'skipped';
        this.conflictState.index++;

        if (this.conflictState.index < queue.length) {
            this.renderCurrentConflict();
        } else {
            this.showConflictSummary();
        }
    }

    undoLastConflict() {
        if (!this.conflictState || this.conflictState.history.length === 0) return;

        const lastState = this.conflictState.history.pop();
        this.conflictState.index = lastState.index;

        // Rollback resolution if one was added
        if (this.conflictState.resolutions.length > lastState.resolutionsCount) {
            this.conflictState.resolutions.pop();
        }

        lastState.pair.status = 'pending';
        this.renderCurrentConflict();
    }

    batchResolveAll(action) {
        if (!this.conflictState) return;
        const { queue, index } = this.conflictState;

        for (let i = index; i < queue.length; i++) {
            const pair = queue[i];
            if (pair.status !== 'resolved') {
                this.addResolution(action, pair);
                pair.status = 'resolved';
            }
        }

        this.conflictState.index = queue.length;
        this.showConflictSummary();
    }

    addResolution(action, pair) {
        if (action === 'skip') {
            // Keep Existing -> Skip CSV row
            this.conflictState.resolutions.push({
                action: 'skip',
                problem: pair.imported
            });
        } else if (action === 'update') {
            // Replace with Imported -> Overwrite existing DB record preserving existing.id
            this.conflictState.resolutions.push({
                action: 'update',
                problem: {
                    ...pair.imported,
                    id: pair.existing.id
                }
            });
        } else if (action === 'insert') {
            // Keep Both -> Import CSV row as a new entry with a fresh ID & suffix if needed
            const hasSameName = pair.imported.name.trim().toLowerCase() === pair.existing.name.trim().toLowerCase();
            const copyName = hasSameName ? `${pair.imported.name} (Imported Copy)` : pair.imported.name;

            this.conflictState.resolutions.push({
                action: 'insert',
                problem: {
                    ...pair.imported,
                    id: 'imp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    name: copyName
                }
            });
        }
    }

    showConflictSummary() {
        if (!this.conflictState) return;
        const { queue, resolutions, totalCount } = this.conflictState;

        const activeView = document.getElementById('conflict-active-view');
        const summaryView = document.getElementById('conflict-summary-view');

        if (activeView) activeView.classList.add('hidden');
        if (summaryView) summaryView.classList.remove('hidden');

        let keptCount = 0;
        let replacedCount = 0;
        let bothCount = 0;
        let skippedCount = 0;

        resolutions.forEach(r => {
            if (r.action === 'skip') keptCount++;
            if (r.action === 'update') replacedCount++;
            if (r.action === 'insert') bothCount++;
        });

        queue.forEach(item => {
            if (item.status === 'skipped') skippedCount++;
        });

        const totalTextEl = document.getElementById('summary-total-text');
        const countKeptEl = document.getElementById('summary-count-kept');
        const countReplacedEl = document.getElementById('summary-count-replaced');
        const countBothEl = document.getElementById('summary-count-both');
        const countSkippedEl = document.getElementById('summary-count-skipped');
        const btnReviewSkipped = document.getElementById('btn-review-skipped');
        const skippedNumSpan = document.getElementById('summary-skipped-num');

        if (totalTextEl) {
            const resolvedCount = keptCount + replacedCount + bothCount;
            totalTextEl.textContent = `Resolved ${resolvedCount} of ${totalCount} conflicts${skippedCount > 0 ? ` (${skippedCount} skipped)` : ''}`;
        }

        if (countKeptEl) countKeptEl.textContent = keptCount;
        if (countReplacedEl) countReplacedEl.textContent = replacedCount;
        if (countBothEl) countBothEl.textContent = bothCount;
        if (countSkippedEl) countSkippedEl.textContent = skippedCount;

        if (btnReviewSkipped && skippedNumSpan) {
            if (skippedCount > 0) {
                btnReviewSkipped.classList.remove('hidden');
                skippedNumSpan.textContent = skippedCount;
            } else {
                btnReviewSkipped.classList.add('hidden');
            }
        }
    }

    reviewSkippedConflicts() {
        if (!this.conflictState) return;
        const skippedItems = this.conflictState.queue.filter(item => item.status === 'skipped');

        if (skippedItems.length === 0) return;

        skippedItems.forEach(item => item.status = 'pending');

        this.conflictState.queue = skippedItems;
        this.conflictState.index = 0;

        const activeView = document.getElementById('conflict-active-view');
        const summaryView = document.getElementById('conflict-summary-view');

        if (activeView) activeView.classList.remove('hidden');
        if (summaryView) summaryView.classList.add('hidden');

        this.renderCurrentConflict();
    }

    finalizeConflictResolution() {
        const modal = document.getElementById('conflict-modal');
        if (modal) modal.classList.add('hidden');

        if (!this.conflictState) return;
        const allItems = [...this.conflictState.staged, ...this.conflictState.resolutions];
        this.conflictState = null;

        this.executeBatchImport(allItems);
    }

    async executeBatchImport(allItems) {
        if (!allItems || allItems.length === 0) {
            Toast.show('No problem records to import.', 'info');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/problems/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: allItems })
            });

            if (!response.ok) throw new Error('Server returned HTTP ' + response.status);

            const result = await response.json();
            const { inserted = 0, updated = 0, skipped = 0 } = result;

            Toast.show(`Import complete: ${inserted} inserted, ${updated} updated, ${skipped} skipped ✓`, 'success');
            await this.loadProblems();
        } catch (err) {
            console.warn('Batch import server request failed, updating local state:', err);

            let inserted = 0;
            let updated = 0;
            let skipped = 0;

            allItems.forEach(item => {
                if (item.action === 'skip') {
                    skipped++;
                } else if (item.action === 'update') {
                    const idx = this.problems.findIndex(p => p.id === item.problem.id);
                    if (idx !== -1) {
                        this.problems[idx] = item.problem;
                    } else {
                        this.problems.unshift(item.problem);
                    }
                    updated++;
                } else {
                    this.problems.unshift(item.problem);
                    inserted++;
                }
            });

            Storage.set('dsa_problems', this.problems);
            this.renderSpreadsheet();
            this.updateStats();

            Toast.show(`Import applied locally: ${inserted} inserted, ${updated} updated, ${skipped} skipped`, 'info');
        }
    }

    /* ─── CSV Text Fallback Parser ─────────────────────────── */

    parseCSVText(text) {
        if (!text) return [];
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split(/\r?\n/);
        if (lines.length < 2) return [];

        const parseRow = (line) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        current += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (ch === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += ch;
                }
            }
            result.push(current);
            return result;
        };

        const headers = parseRow(lines[0]);
        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = parseRow(line);
            const row = {};
            headers.forEach((h, idx) => {
                row[h.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
            });
            rows.push(row);
        }
        return rows;
    }

    /* ─── Helpers ────────────────────────────────────────────── */

    parseSecondsFromFormatted(str) {
        if (!str) return 0;
        const s = String(str).trim();
        if (!isNaN(s) && s !== '') return parseInt(s);

        let total = 0;
        const hoursMatch = s.match(/(\d+)\s*h/i);
        const minsMatch = s.match(/(\d+)\s*m/i);
        const secsMatch = s.match(/(\d+)\s*s/i);

        if (hoursMatch) total += parseInt(hoursMatch[1]) * 3600;
        if (minsMatch) total += parseInt(minsMatch[1]) * 60;
        if (secsMatch) total += parseInt(secsMatch[1]);

        return total;
    }

    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    updateStats() {
        // Use local date (not UTC ISO string) so IST dates are always correct
        const _t = new Date();
        const todayStr = `${_t.getFullYear()}-${String(_t.getMonth() + 1).padStart(2, '0')}-${String(_t.getDate()).padStart(2, '0')}`;

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

        const sortedDates = Array.from(uniqueDates).sort((a, b) => b.localeCompare(a));
        let streak = 0;
        // Use local midnight for today to avoid UTC offset issues
        const _todayRef = new Date();
        let checkDate = new Date(_todayRef.getFullYear(), _todayRef.getMonth(), _todayRef.getDate());

        for (let i = 0; i < sortedDates.length; i++) {
            // Parse date string as local midnight (not UTC) to avoid off-by-one day in IST
            const parts = sortedDates[i].split('-');
            const pDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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

        // Update Pace & Completion Projection Meter
        this.updatePaceAndProjection();
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

    /* ─── Pace & Completion Projection Controller ─────────────── */

    bindPaceEvents() {
        const btn7d = document.getElementById('btn-pace-7d');
        const btn14d = document.getElementById('btn-pace-14d');
        const chkWeighted = document.getElementById('chk-pace-weighted');
        const btnEditTarget = document.getElementById('btn-edit-target-total');
        const btnEditSolved = document.getElementById('btn-edit-solved-count');

        if (btn7d) {
            btn7d.addEventListener('click', () => {
                this.paceWindowDays = 7;
                btn7d.classList.add('active');
                if (btn14d) btn14d.classList.remove('active');
                this.savePaceSetting('pace_window_days', 7);
                this.updatePaceAndProjection();
            });
        }

        if (btn14d) {
            btn14d.addEventListener('click', () => {
                this.paceWindowDays = 14;
                btn14d.classList.add('active');
                if (btn7d) btn7d.classList.remove('active');
                this.savePaceSetting('pace_window_days', 14);
                this.updatePaceAndProjection();
            });
        }

        if (chkWeighted) {
            chkWeighted.addEventListener('change', (e) => {
                this.paceWeightedMode = e.target.checked;
                this.savePaceSetting('pace_weighted_mode', this.paceWeightedMode ? 'true' : 'false');
                this.updatePaceAndProjection();
            });
        }

        if (btnEditSolved) {
            btnEditSolved.addEventListener('click', () => {
                const solvedDisplay = document.getElementById('pace-solved-display');
                if (!solvedDisplay || solvedDisplay.querySelector('input')) return;

                const dbLogged = this.problems.length;
                const currentTotalSolved = Math.max(0, dbLogged + (this.externalSolvedOffset || 0));

                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'input-daily-goal';
                input.style.width = '64px';
                input.style.height = '20px';
                input.style.fontSize = '0.8rem';
                input.value = currentTotalSolved;
                input.min = 0;
                input.max = 5000;

                solvedDisplay.innerHTML = '';
                solvedDisplay.appendChild(input);
                btnEditSolved.style.display = 'none';

                input.focus();
                input.select();

                let hasSaved = false;
                const saveAndRevert = (shouldSave = true) => {
                    if (hasSaved) return;
                    hasSaved = true;

                    const val = parseInt(input.value);
                    if (shouldSave && !isNaN(val) && val >= 0) {
                        this.externalSolvedOffset = val - dbLogged;
                        this.savePaceSetting('external_solved_offset', String(this.externalSolvedOffset));
                        Toast.show(`Actual solved count set to ${val} problems!`, 'success');
                    }

                    const totalSolvedNow = Math.max(0, dbLogged + (this.externalSolvedOffset || 0));
                    solvedDisplay.innerHTML = `<strong id="pace-solved-count">${totalSolvedNow}</strong>`;
                    btnEditSolved.style.display = 'inline-block';
                    this.updatePaceAndProjection();
                };

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') saveAndRevert(true);
                    else if (e.key === 'Escape') saveAndRevert(false);
                });

                input.addEventListener('blur', () => saveAndRevert(true));
            });
        }

        if (btnEditTarget) {
            btnEditTarget.addEventListener('click', () => {
                const targetDisplay = document.getElementById('pace-target-display');
                if (!targetDisplay || targetDisplay.querySelector('input')) return;

                const currentVal = this.targetTotalProblems;
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'input-daily-goal';
                input.style.width = '64px';
                input.style.height = '20px';
                input.style.fontSize = '0.8rem';
                input.value = currentVal;
                input.min = 1;
                input.max = 5000;

                targetDisplay.innerHTML = '';
                targetDisplay.appendChild(input);
                btnEditTarget.style.display = 'none';

                input.focus();
                input.select();

                let hasSaved = false;
                const saveAndRevert = (shouldSave = true) => {
                    if (hasSaved) return;
                    hasSaved = true;

                    const val = parseInt(input.value);
                    if (shouldSave && !isNaN(val) && val > 0) {
                        this.targetTotalProblems = val;
                        this.savePaceSetting('target_total_problems', String(val));
                        Toast.show(`Sheet target updated to ${val} problems!`, 'success');
                    }

                    targetDisplay.innerHTML = `<strong id="pace-target-count">${this.targetTotalProblems}</strong>`;
                    btnEditTarget.style.display = 'inline-block';
                    this.updatePaceAndProjection();
                };

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') saveAndRevert(true);
                    else if (e.key === 'Escape') saveAndRevert(false);
                });

                input.addEventListener('blur', () => saveAndRevert(true));
            });
        }
    }

    async loadPaceSettings() {
        try {
            const [resTarget, resWindow, resWeighted, resOffset] = await Promise.all([
                fetch('http://localhost:3000/api/kv/target_total_problems').catch(() => null),
                fetch('http://localhost:3000/api/kv/pace_window_days').catch(() => null),
                fetch('http://localhost:3000/api/kv/pace_weighted_mode').catch(() => null),
                fetch('http://localhost:3000/api/kv/external_solved_offset').catch(() => null)
            ]);

            if (resTarget && resTarget.ok) {
                const data = await resTarget.json();
                if (data && data.value) this.targetTotalProblems = parseInt(data.value) || 474;
            } else {
                this.targetTotalProblems = parseInt(localStorage.getItem('dsa_target_total_problems')) || 474;
            }

            if (resWindow && resWindow.ok) {
                const data = await resWindow.json();
                if (data && data.value) this.paceWindowDays = parseInt(data.value) || 7;
            } else {
                this.paceWindowDays = parseInt(localStorage.getItem('dsa_pace_window_days')) || 7;
            }

            if (resWeighted && resWeighted.ok) {
                const data = await resWeighted.json();
                if (data && data.value) this.paceWeightedMode = data.value === 'true';
            } else {
                this.paceWeightedMode = localStorage.getItem('dsa_pace_weighted_mode') === 'true';
            }

            if (resOffset && resOffset.ok) {
                const data = await resOffset.json();
                if (data && data.value) this.externalSolvedOffset = parseInt(data.value) || 0;
            } else {
                this.externalSolvedOffset = parseInt(localStorage.getItem('dsa_external_solved_offset')) || 0;
            }
        } catch (e) {
            console.warn('Failed loading pace settings from backend, using fallbacks:', e);
            this.targetTotalProblems = parseInt(localStorage.getItem('dsa_target_total_problems')) || 474;
            this.paceWindowDays = parseInt(localStorage.getItem('dsa_pace_window_days')) || 7;
            this.paceWeightedMode = localStorage.getItem('dsa_pace_weighted_mode') === 'true';
            this.externalSolvedOffset = parseInt(localStorage.getItem('dsa_external_solved_offset')) || 0;
        }

        // Apply loaded settings to UI controls
        const btn7d = document.getElementById('btn-pace-7d');
        const btn14d = document.getElementById('btn-pace-14d');
        const chkWeighted = document.getElementById('chk-pace-weighted');

        if (this.paceWindowDays === 14) {
            if (btn14d) btn14d.classList.add('active');
            if (btn7d) btn7d.classList.remove('active');
        } else {
            if (btn7d) btn7d.classList.add('active');
            if (btn14d) btn14d.classList.remove('active');
        }

        if (chkWeighted) chkWeighted.checked = this.paceWeightedMode;

        this.updatePaceAndProjection();
    }

    savePaceSetting(key, val) {
        localStorage.setItem(`dsa_${key}`, String(val));
        fetch(`http://localhost:3000/api/kv/${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: String(val) })
        }).catch(() => {});
    }

    updatePaceAndProjection() {
        const solvedCountEl = document.getElementById('pace-solved-count');
        const targetCountEl = document.getElementById('pace-target-count');
        const percentEl = document.getElementById('pace-percent');
        const remainingBadgeEl = document.getElementById('pace-remaining-badge');
        const progressFillEl = document.getElementById('pace-progress-fill');

        const velocityValEl = document.getElementById('pace-velocity-val');
        const velocityLabelEl = document.getElementById('pace-velocity-label');

        const timeValEl = document.getElementById('pace-time-val');
        const timeLabelEl = document.getElementById('pace-time-label');

        const dateValEl = document.getElementById('pace-date-val');
        const dateLabelEl = document.getElementById('pace-date-label');

        if (!solvedCountEl) return;

        const dbLogged = this.problems.length;
        const totalSolved = Math.max(0, dbLogged + (this.externalSolvedOffset || 0));
        const targetTotal = this.targetTotalProblems || 474;
        const remaining = Math.max(0, targetTotal - totalSolved);
        const percent = Math.min(100, (totalSolved / Math.max(1, targetTotal)) * 100);

        if (solvedCountEl) solvedCountEl.textContent = totalSolved;
        if (targetCountEl) targetCountEl.textContent = targetTotal;
        if (percentEl) percentEl.textContent = `${percent.toFixed(1)}%`;
        if (remainingBadgeEl) remainingBadgeEl.textContent = `${remaining} remaining`;
        if (progressFillEl) progressFillEl.style.width = `${percent}%`;

        // Rolling Velocity Calculation
        const windowDays = this.paceWindowDays || 7;
        const isWeighted = this.paceWeightedMode || false;

        const now = new Date();
        now.setHours(23, 59, 59, 999);

        const windowStart = new Date(now);
        windowStart.setDate(windowStart.getDate() - windowDays);
        windowStart.setHours(0, 0, 0, 0);

        let countInWindow = 0;
        let weightedPointsInWindow = 0;

        let totalWeightedPointsAllTime = 0;

        this.problems.forEach(p => {
            const diff = (p.difficulty || 'Medium').toLowerCase();
            let weight = 1.5;
            if (diff === 'easy') weight = 1.0;
            else if (diff === 'hard') weight = 2.5;

            totalWeightedPointsAllTime += weight;

            if (p.date) {
                const pDate = new Date(p.date + 'T00:00:00');
                if (pDate >= windowStart && pDate <= now) {
                    countInWindow++;
                    weightedPointsInWindow += weight;
                }
            }
        });

        const dailyVelocity = countInWindow / windowDays;
        const weeklyVelocity = dailyVelocity * 7;

        const dailyWeightedVelocity = weightedPointsInWindow / windowDays;
        const weeklyWeightedVelocity = dailyWeightedVelocity * 7;

        // Display Velocity
        if (velocityValEl) {
            if (isWeighted) {
                velocityValEl.textContent = `${weeklyWeightedVelocity.toFixed(1)} pts/wk`;
            } else {
                velocityValEl.textContent = `${weeklyVelocity.toFixed(1)} / wk`;
            }
        }
        if (velocityLabelEl) {
            const perDayStr = isWeighted ? `${dailyWeightedVelocity.toFixed(1)} pts/day` : `${dailyVelocity.toFixed(1)} / day`;
            velocityLabelEl.textContent = `${perDayStr} (${windowDays}d window${isWeighted ? ', Weighted' : ''})`;
        }

        // Time Remaining & Projected Completion Date
        let daysRemaining = 0;
        let weeksRemaining = 0;
        let dateStr = 'N/A';
        let dateLabel = 'Est. Completion Date';
        let timeSubText = '0 days remaining';

        if (totalSolved >= targetTotal) {
            if (timeValEl) timeValEl.textContent = 'Goal Met!';
            if (timeLabelEl) timeLabelEl.textContent = '0 days remaining';
            if (dateValEl) dateValEl.textContent = 'Completed!';
            if (dateLabelEl) dateLabelEl.textContent = 'All target problems solved';
            return;
        }

        if (!isWeighted) {
            if (dailyVelocity > 0) {
                daysRemaining = remaining / dailyVelocity;
                weeksRemaining = daysRemaining / 7;

                const estDate = new Date();
                estDate.setDate(estDate.getDate() + Math.round(daysRemaining));

                dateStr = estDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                timeSubText = `${Math.round(daysRemaining)} days remaining`;
            } else {
                dateStr = 'Solve to estimate';
                timeSubText = 'No recent activity';
            }
        } else {
            // Weighted mode: remaining weighted points
            const avgWeightAllTime = dbLogged > 0 ? (totalWeightedPointsAllTime / dbLogged) : 1.6;
            const remainingWeightedPoints = remaining * avgWeightAllTime;

            if (dailyWeightedVelocity > 0) {
                daysRemaining = remainingWeightedPoints / dailyWeightedVelocity;
                weeksRemaining = daysRemaining / 7;

                const estDate = new Date();
                estDate.setDate(estDate.getDate() + Math.round(daysRemaining));

                dateStr = estDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                });
                timeSubText = `${Math.round(daysRemaining)} days (Weighted effort)`;
            } else {
                dateStr = 'Solve to estimate';
                timeSubText = 'No recent activity';
            }
        }

        if (timeValEl) {
            timeValEl.textContent = daysRemaining > 0 ? `~${weeksRemaining.toFixed(1)} wks` : 'N/A';
        }
        if (timeLabelEl) timeLabelEl.textContent = timeSubText;

        if (dateValEl) dateValEl.textContent = dateStr;
        if (dateLabelEl) dateLabelEl.textContent = dateLabel;
    }
}

/* ─── Journal Manager Class ──────────────────────────────── */
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
        this.backdrop = document.getElementById('journal-modal-backdrop');
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

        // View toggle elements
        this.btnViewGrid = document.getElementById('btn-view-grid');
        this.btnViewDeck = document.getElementById('btn-view-deck');
        this.gridWrapper = document.getElementById('journal-grid-wrapper');
        this.deckContainer = document.getElementById('journal-deck-container');
        this.calendarGridBody = document.getElementById('journal-calendar-grid-body');
        this.journalViewTitle = document.getElementById('journal-view-title');
        this.journalViewSubtext = document.getElementById('journal-view-subtext');

        // Deck elements
        this.deckTrack = document.getElementById('deck-cards-track');
        this.deckViewport = document.getElementById('deck-cards-viewport');
        this.btnDeckPrev = document.getElementById('btn-deck-prev');
        this.btnDeckNext = document.getElementById('btn-deck-next');
        this.deckCounterBadge = document.getElementById('deck-counter-badge');
        this.deckPaginationBar = document.getElementById('deck-pagination-bar');
        this.deckFilterAll = document.getElementById('deck-filter-all');
        this.deckFilterEntries = document.getElementById('deck-filter-entries');

        // Deck state
        this.activeView = 'grid';
        this.deckCards = [];
        this.deckIndex = 0;
        this.deckFilter = 'all';

        // Continuous Physics Scroll & 3D Tilt State
        this.deckScrollTarget = 0;
        this.deckScrollCurrent = 0;
        this.deckTiltTargetX = 0;
        this.deckTiltTargetY = 0;
        this.deckTiltCurrentX = 0;
        this.deckTiltCurrentY = 0;
        this.isDraggingDeck = false;
        this.dragStartY = 0;
        this.dragStartScrollTarget = 0;
    }

    bindEvents() {
        // Document-level click delegate for opening journal modal reliably from any location
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#btn-open-journal-modal') || 
                        e.target.closest('.journal-new-btn') || 
                        e.target.closest('[data-action="open-journal"]');
            if (btn) {
                if (btn.closest('#deck-cards-viewport')) return;
                e.preventDefault();
                e.stopPropagation();
                if (this.app && typeof this.app.switchTab === 'function') {
                    this.app.switchTab('journal');
                }
                const dateFromBtn = btn.getAttribute('data-date');
                const targetDate = dateFromBtn || this.getTodayDateStr();
                this.openModalForDate(targetDate);
            }
        });

        if (this.btnCloseModal) {
            this.btnCloseModal.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeModal();
            });
        }

        if (this.btnCancel) {
            this.btnCancel.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.closeModal();
            });
        }

        if (this.backdrop) {
            this.backdrop.addEventListener('click', (e) => {
                this.closeModal();
            });
        }

        // Backdrop click to close journal modal when clicking outside card
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.closeModal();
                }
            });
        }

        // Click empty state text to quickly write entry
        if (this.emptyState) {
            this.emptyState.addEventListener('click', () => {
                const todayStr = this.getTodayDateStr();
                this.openModalForDate(todayStr);
            });
            this.emptyState.style.cursor = 'pointer';
        }

        // Escape key to close journal modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal && !this.modal.classList.contains('hidden')) {
                this.closeModal();
            }
        });

        if (this.btnPrevMonth) {
            this.btnPrevMonth.addEventListener('click', () => {
                this.currentMonth--;
                if (this.currentMonth < 0) {
                    this.currentMonth = 11;
                    this.currentYear--;
                }
                this.renderCalendar();
                this.renderDeckView();
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
                this.renderDeckView();
            });
        }

        if (this.btnToday) {
            this.btnToday.addEventListener('click', () => {
                this.goToToday();
            });
        }

        if (this.inputContent) {
            this.inputContent.addEventListener('input', () => {
                this.updateWordCount();
                this.triggerDraftAutoSave();
            });
        }

        if (this.inputTitle) {
            this.inputTitle.addEventListener('input', () => {
                this.triggerDraftAutoSave();
            });
        }

        if (this.form) {
            this.form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEntry();
            });
        }

        if (this.btnDelete) {
            this.btnDelete.addEventListener('click', () => {
                const id = this.inputId ? this.inputId.value : null;
                if (id) this.deleteEntry(id);
            });
        }

        // ─── View Toggle: Grid ↔ Card Deck ───
        if (this.btnViewGrid) {
            this.btnViewGrid.addEventListener('click', () => {
                this.switchView('grid');
            });
        }

        if (this.btnViewDeck) {
            this.btnViewDeck.addEventListener('click', () => {
                this.switchView('deck');
            });
        }

        // ─── Deck Navigation Arrows ───
        if (this.btnDeckPrev) {
            this.btnDeckPrev.addEventListener('click', () => {
                this.navigateDeck(-1);
            });
        }

        if (this.btnDeckNext) {
            this.btnDeckNext.addEventListener('click', () => {
                this.navigateDeck(1);
            });
        }

        // ─── Deck Filter Pills ───
        if (this.deckFilterAll) {
            this.deckFilterAll.addEventListener('click', () => {
                this.deckFilter = 'all';
                if (this.deckFilterAll) this.deckFilterAll.classList.add('active');
                if (this.deckFilterEntries) this.deckFilterEntries.classList.remove('active');
                this.renderDeckView();
            });
        }

        if (this.deckFilterEntries) {
            this.deckFilterEntries.addEventListener('click', () => {
                this.deckFilter = 'entries';
                if (this.deckFilterEntries) this.deckFilterEntries.classList.add('active');
                if (this.deckFilterAll) this.deckFilterAll.classList.remove('active');
                this.renderDeckView();
            });
        }

        // ─── Deck Ambient Glow & Drag State Initialization ───
        this.deckAmbientGlow = document.getElementById('deck-ambient-glow');

        // ─── Deck Pointer Drag / Wheel / Mouse Tilt Navigation ───
        if (this.deckViewport) {
            const getCardAtPoint = (clientX, clientY) => {
                const elementsAtPoint = typeof document.elementsFromPoint === "function"
                    ? document.elementsFromPoint(clientX, clientY)
                    : [];
                const cardFromHitTest = elementsAtPoint.find((element) =>
                    element.classList && element.classList.contains("journal-deck-card")
                );
                if (cardFromHitTest) return cardFromHitTest;

                // A card can temporarily miss the browser hit test while its 3D
                // transform is being updated. Use its rendered bounds as a stable
                // fallback for the press that started the gesture.
                const activeCard = this.deckTrack?.querySelector(".journal-deck-card.active-card");
                if (!activeCard) return null;

                const rect = activeCard.getBoundingClientRect();
                return clientX >= rect.left && clientX <= rect.right &&
                    clientY >= rect.top && clientY <= rect.bottom
                    ? activeCard
                    : null;
            };

            // Pointer Down for Drag Physics (Horizontal Drag)
            this.deckViewport.addEventListener('pointerdown', (e) => {
                if (this.activeView !== 'deck' || !this.deckCards || this.deckCards.length === 0) return;
                
                this.isPointerDownOnDeck = true;
                this._dragPointerDownCard = e.target?.closest?.('.journal-deck-card') ||
                    getCardAtPoint(e.clientX, e.clientY);
                this._dragPointerDownTime = Date.now();
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;
                this.dragStartScrollTarget = this.deckScrollTarget;
                this.isDraggingDeck = false;
                this._wasDraggingDeck = false;

                // Capture from the initial press so a moving 3D card cannot
                // redirect pointerup/pointercancel to another element.
                try {
                    this.deckViewport.setPointerCapture(e.pointerId);
                } catch (err) {}
            });

            // Pointer Move for Continuous Drag & Realtime 3D Mouse Tilt
            this.deckViewport.addEventListener('pointermove', (e) => {
                if (this.activeView !== 'deck') return;

                // Subtle & Refined 3D Cursor Tilt relative to Viewport Center
                const rect = this.deckViewport.getBoundingClientRect();
                const relX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
                const relY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);

                this.deckTiltTargetX = -relY * 8; // Gentle, subtle 3D tilt X
                this.deckTiltTargetY = relX * 8;  // Gentle, subtle 3D tilt Y

                if (this.isPointerDownOnDeck) {
                    const deltaX = e.clientX - this.dragStartX;
                    const deltaY = e.clientY - this.dragStartY;
                    const absX = Math.abs(deltaX);
                    const absY = Math.abs(deltaY);

                    // Require intentional horizontal drag gesture (> 28px horizontal & horizontal dominance)
                    // This prevents normal mouse clicks while hovering from false-triggering deck drag.
                    if (absX > 28 && absX > absY * 1.2 && !this.isDraggingDeck) {
                        this.isDraggingDeck = true;
                        this._wasDraggingDeck = true;
                        this.deckViewport.classList.add('is-dragging');
                    }

                    if (this.isDraggingDeck) {
                        this.deckScrollTarget = Math.max(0, Math.min(this.deckCards.length - 1, this.dragStartScrollTarget - (deltaX / 140)));
                    }
                }
            });

            const handlePointerRelease = (e) => {
                if (!this.isPointerDownOnDeck) return;
                this.isPointerDownOnDeck = false;

                const clickedCard = this._dragPointerDownCard || (e.target ? e.target.closest('.journal-deck-card') : null);

                if (this.isDraggingDeck) {
                    this.isDraggingDeck = false;
                    this._wasDraggingDeck = true;
                    this.deckViewport.classList.remove('is-dragging');
                } else {
                    this._wasDraggingDeck = false;

                    // Direct pointer release trigger: if user tapped/clicked a card without performing a drag swipe,
                    // open the journal modal immediately regardless of browser click event quirks or 3D transform shifts.
                    if (clickedCard) {
                        const dateStr = clickedCard.getAttribute('data-date');
                        const idx = parseInt(clickedCard.getAttribute('data-deck-index'), 10);
                        if (!isNaN(idx)) {
                            this._deckUserNavigated = true;
                            this.deckIndex = idx;
                            this.deckScrollTarget = idx;
                        }
                        if (dateStr) {
                            this.openModalForDate(dateStr);
                        }
                    }
                }

                this.deckScrollTarget = Math.round(this.deckScrollTarget);
                this.deckIndex = this.deckScrollTarget;
                this._deckUserNavigated = true;
                this.updateDeckCounterAndPagination();

                try {
                    if (this.deckViewport.hasPointerCapture(e.pointerId)) {
                        this.deckViewport.releasePointerCapture(e.pointerId);
                    }
                } catch (err) {}
            };

            this.deckViewport.addEventListener('pointerup', handlePointerRelease);
            this.deckViewport.addEventListener('pointercancel', handlePointerRelease);

            this.deckViewport.addEventListener('pointerleave', (e) => {
                this.deckTiltTargetX = 0;
                this.deckTiltTargetY = 0;
            });

            // Wheel / Trackpad Horizontal Continuous Scroll
            this.deckViewport.addEventListener('wheel', (e) => {
                if (this.activeView !== 'deck' || !this.deckCards || this.deckCards.length === 0) return;
                e.preventDefault();
                
                const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                this.deckScrollTarget += delta * 0.0028;
                this.deckScrollTarget = Math.max(0, Math.min(this.deckCards.length - 1, this.deckScrollTarget));
                this._deckUserNavigated = true;

                clearTimeout(this._deckSnapTimer);
                this._deckSnapTimer = setTimeout(() => {
                    this.deckScrollTarget = Math.round(this.deckScrollTarget);
                    this.deckIndex = this.deckScrollTarget;
                    this.updateDeckCounterAndPagination();
                }, 160);
            }, { passive: false });
        }

        // Keyboard arrow keys for horizontal deck navigation
        document.addEventListener('keydown', (e) => {
            if (this.activeView !== 'deck') return;
            if (this.modal && !this.modal.classList.contains('hidden')) return;
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateDeck(-1);
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateDeck(1);
            }
        });
    }

    // ─── View Toggle Logic ───
    switchView(viewName) {
        if (this.activeView === viewName) return;
        this.activeView = viewName;

        if (viewName === 'grid') {
            if (this.calendarGridBody) this.calendarGridBody.classList.remove('hidden');
            if (this.gridWrapper) this.gridWrapper.classList.remove('hidden');
            if (this.deckContainer) this.deckContainer.classList.add('hidden');
            if (this.btnViewGrid) {
                this.btnViewGrid.classList.add('active');
                this.btnViewGrid.setAttribute('aria-pressed', 'true');
            }
            if (this.btnViewDeck) {
                this.btnViewDeck.classList.remove('active');
                this.btnViewDeck.setAttribute('aria-pressed', 'false');
            }
            if (this.journalViewTitle) this.journalViewTitle.textContent = 'Calendar View';
            if (this.journalViewSubtext) this.journalViewSubtext.textContent = 'Click on any date to write or view thoughts for that day';
        } else {
            if (this.calendarGridBody) this.calendarGridBody.classList.add('hidden');
            if (this.gridWrapper) this.gridWrapper.classList.add('hidden');
            if (this.deckContainer) this.deckContainer.classList.remove('hidden');
            if (this.btnViewDeck) {
                this.btnViewDeck.classList.add('active');
                this.btnViewDeck.setAttribute('aria-pressed', 'true');
            }
            if (this.btnViewGrid) {
                this.btnViewGrid.classList.remove('active');
                this.btnViewGrid.setAttribute('aria-pressed', 'false');
            }
            if (this.journalViewTitle) this.journalViewTitle.textContent = 'Cards View';
            if (this.journalViewSubtext) this.journalViewSubtext.textContent = 'Browse your daily reflections with 3D interactive cards';
            this.renderDeckView();
        }
    }

    // ─── Continuous Physics Animation Loop for Scroll & 3D Tilt ───
    startDeckAnimationLoop() {
        if (this._deckLoopRunning) return;
        this._deckLoopRunning = true;

        const step = () => {
            if (this.activeView === 'deck' && this.deckCards && this.deckCards.length > 0) {
                // Lerp Scroll Position continuously
                const scrollDiff = this.deckScrollTarget - this.deckScrollCurrent;
                if (Math.abs(scrollDiff) > 0.0001) {
                    this.deckScrollCurrent += scrollDiff * 0.14;
                } else {
                    this.deckScrollCurrent = this.deckScrollTarget;
                }

                // Lerp 3D Mouse Cursor Tilt Angles
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

    // Dynamic Realtime Continuous Horizontal Transform Update
    updateDeckTransformsRealtime() {
        if (!this.deckTrack) return;
        const cardElements = this.deckTrack.querySelectorAll('.journal-deck-card');

        cardElements.forEach(cardEl => {
            const idx = parseInt(cardEl.getAttribute('data-deck-index'), 10);
            if (isNaN(idx)) return;

            const offset = idx - this.deckScrollCurrent;
            const absOffset = Math.abs(offset);
            const dir = offset > 0 ? 1 : -1;

            // Condensed Horizontal 3D Cover Flow Physics (7:5 vertical format, ~140px peek)
            const translateX = offset * 140;
            const translateZ = -absOffset * 80;
            const rotateYCurve = -dir * Math.min(20, absOffset * 10);
            const scale = Math.max(0.72, 1 - absOffset * 0.07);
            const opacity = Math.max(0, 1 - absOffset * 0.25);
            const zIndex = Math.round(100 - absOffset * 10);

            // Dynamic 3D Cursor Tilt (Gentle & Refined)
            const cardTiltFactor = Math.max(0.2, 1 - absOffset * 0.3);
            const rotX = (this.deckTiltCurrentX * cardTiltFactor);
            const rotY = rotateYCurve + (this.deckTiltCurrentY * cardTiltFactor);

            cardEl.style.transform = `translate(-50%, -50%) translateX(${translateX}px) translateZ(${translateZ}px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(${scale})`;
            cardEl.style.opacity = opacity;
            cardEl.style.zIndex = zIndex;
            cardEl.style.filter = absOffset > 0.5 ? `blur(${absOffset * 0.5}px)` : 'none';

            if (absOffset < 0.5) {
                cardEl.classList.add('active-card');
            } else {
                cardEl.classList.remove('active-card');
            }
        });
    }

    // ─── Ambient Dynamic Backdrop ───
    updateAmbientGlow(activeCard) {
        if (!this.deckAmbientGlow) this.deckAmbientGlow = document.getElementById('deck-ambient-glow');
        if (!this.deckAmbientGlow) return;

        let color1, color2;
        if (!activeCard) {
            color1 = 'rgba(223, 79, 41, 0.22)';
            color2 = 'rgba(16, 185, 129, 0.08)';
        } else if (activeCard.isToday) {
            color1 = 'rgba(223, 79, 41, 0.38)';
            color2 = 'rgba(247, 148, 29, 0.22)';
        } else if (activeCard.entries && activeCard.entries.length > 0) {
            color1 = 'rgba(16, 185, 129, 0.32)';
            color2 = 'rgba(59, 130, 246, 0.15)';
        } else {
            color1 = 'rgba(99, 102, 241, 0.18)';
            color2 = 'rgba(15, 23, 42, 0.12)';
        }

        this.deckAmbientGlow.style.background = `radial-gradient(circle at 50% 45%, ${color1} 0%, ${color2} 55%, transparent 75%)`;
    }

    playDeckTickSound() {
        // Silenced audio as requested by user
    }

    // ─── Journal Card Deck View Rendering (Clean Theme Aesthetic) ───
    renderDeckView() {
        if (!this.deckTrack || !this.deckCounterBadge || !this.deckPaginationBar) return;

        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const todayStr = this.getTodayDateStr();
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Build journal lookup map
        const journalMap = {};
        (this.journals || []).forEach(j => {
            if (j.date) {
                if (!journalMap[j.date]) journalMap[j.date] = [];
                journalMap[j.date].push(j);
            }
        });

        // Build card data for each day of the month
        let allCards = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayObj = new Date(this.currentYear, this.currentMonth, day);
            const entries = journalMap[dateStr] || [];
            const isToday = dateStr === todayStr;
            allCards.push({ day, dateStr, dayObj, entries, isToday });
        }

        // Apply filter
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

        // Clamp index
        if (this.deckIndex >= allCards.length) this.deckIndex = allCards.length - 1;
        if (this.deckIndex < 0) this.deckIndex = 0;

        // Find today's index if user hasn't manually navigated yet
        const todayIdx = allCards.findIndex(c => c.isToday);
        if (todayIdx >= 0 && this.deckIndex === 0 && !this._deckUserNavigated) {
            this.deckIndex = todayIdx;
        }

        this.deckScrollTarget = this.deckIndex;
        this.deckScrollCurrent = this.deckIndex;

        // Update ambient glow for current active card
        const currentActiveCard = allCards[this.deckIndex];
        this.updateAmbientGlow(currentActiveCard);

        // Render Journal Cards with theme design system aesthetic
        let cardsHTML = '';
        allCards.forEach((card, i) => {
            const isActive = i === this.deckIndex;
            const dayOfWeek = dayNames[card.dayObj.getDay()];
            const monthName = monthNames[this.currentMonth];
            const hasEntry = card.entries.length > 0;
            const latest = hasEntry ? card.entries[0] : null;

            let statusTag = '';
            if (card.isToday) {
                statusTag = '<span class="card-status-tag is-today">TODAY</span>';
            } else if (hasEntry) {
                statusTag = '<span class="card-status-tag has-entry">WRITTEN</span>';
            } else {
                statusTag = '<span class="card-status-tag is-empty">EMPTY</span>';
            }

            let bodyHTML = '';
            if (hasEntry) {
                const titleHTML = latest.title ? `<div class="card-entry-title">${this.escapeHTML(latest.title)}</div>` : `<div class="card-entry-title">Journal Reflection</div>`;
                const snippetText = this.escapeHTML(latest.content || '');
                const wordCount = latest.content ? latest.content.trim().split(/\s+/).length : 0;
                bodyHTML = `
                    <div class="card-body-content" data-action="open-journal" data-date="${card.dateStr}">
                        ${titleHTML}
                        <div class="card-entry-snippet">${snippetText}</div>
                    </div>
                    <div class="card-footer-row">
                        <span class="card-word-count">${wordCount} ${wordCount === 1 ? 'word' : 'words'}</span>
                        <button type="button" class="btn secondary card-action-btn" data-action="open-journal" data-date="${card.dateStr}">✏️ Open Note</button>
                    </div>
                `;
            } else {
                bodyHTML = `
                    <div class="card-body-content" data-action="open-journal" data-date="${card.dateStr}">
                        <div class="card-empty-prompt">
                            <span class="empty-icon">✍️</span>
                            <p>No entry for this day.<br>Tap to write reflection.</p>
                        </div>
                    </div>
                    <div class="card-footer-row">
                        <span class="card-word-count">Empty day</span>
                        <button type="button" class="btn primary card-action-btn" data-action="open-journal" data-date="${card.dateStr}">+ Write Note</button>
                    </div>
                `;
            }

            cardsHTML += `
                <div class="journal-deck-card ${isActive ? 'active-card' : ''} ${card.isToday ? 'today-card' : ''}"
                     data-deck-index="${i}" data-date="${card.dateStr}" data-action="open-journal">
                    
                    <div class="card-header-row">
                        <div class="card-date-group">
                            <span class="card-date-num">${card.day}</span>
                            <span class="card-date-month">${monthName.substring(0, 3)}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                            <span class="card-day-weekday">${dayOfWeek.substring(0, 3)}</span>
                            ${statusTag}
                        </div>
                    </div>

                    ${bodyHTML}
                </div>
            `;
        });

        this.deckTrack.innerHTML = cardsHTML;

        // Update counter & pagination
        this.updateDeckCounterAndPagination();

        // Event binding for clicking anywhere on journal deck cards or action buttons (+ Write Note / ✏️ Open Note)
        this.deckTrack.querySelectorAll('.journal-deck-card').forEach(cardEl => {
            cardEl.addEventListener('click', (e) => {
                // If a real horizontal deck drag was performed, suppress modal trigger
                if (this._wasDraggingDeck || this.isDraggingDeck) {
                    this._wasDraggingDeck = false;
                    return;
                }
                e.preventDefault();
                e.stopPropagation();

                const dateStr = cardEl.getAttribute('data-date');
                const idx = parseInt(cardEl.getAttribute('data-deck-index'), 10);

                if (!isNaN(idx)) {
                    this._deckUserNavigated = true;
                    this.deckIndex = idx;
                    this.deckScrollTarget = idx;
                    this.updateDeckCounterAndPagination();

                    if (dateStr) {
                        this.openModalForDate(dateStr);
                    }
                }
            });
        });

        // Start real-time continuous scroll & 3D mouse tilt loop
        this.startDeckAnimationLoop();
    }

    updateDeckCounterAndPagination() {
        if (!this.deckCards || this.deckCards.length === 0) return;

        if (this.deckCounterBadge) {
            this.deckCounterBadge.textContent = `Day ${this.deckIndex + 1} of ${this.deckCards.length}`;
        }

        if (this.deckPaginationBar) {
            let paginationHTML = '';
            this.deckCards.forEach((card, i) => {
                const isActive = i === this.deckIndex;
                const hasEntry = card.entries.length > 0;
                paginationHTML += `<button type="button" class="deck-dot ${isActive ? 'active' : ''} ${hasEntry ? 'has-entry-dot' : ''}" data-dot-index="${i}" aria-label="Day ${card.day} (${card.isToday ? 'Today' : card.dateStr})"></button>`;
            });
            this.deckPaginationBar.innerHTML = paginationHTML;

            this.deckPaginationBar.querySelectorAll('.deck-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    const idx = parseInt(dot.getAttribute('data-dot-index'), 10);
                    if (!isNaN(idx) && idx !== this.deckIndex) {
                        this._deckUserNavigated = true;
                        this.deckIndex = idx;
                        this.deckScrollTarget = idx;
                        this.updateDeckCounterAndPagination();
                    }
                });
            });
        }

        if (this.deckCards[this.deckIndex]) {
            this.updateAmbientGlow(this.deckCards[this.deckIndex]);
        }
    }

    // ─── Deck Navigation ───
    navigateDeck(direction) {
        if (!this.deckCards || this.deckCards.length === 0) return;
        this._deckUserNavigated = true;
        const newIndex = Math.max(0, Math.min(this.deckCards.length - 1, this.deckIndex + direction));
        if (newIndex === this.deckIndex) return;
        this.deckIndex = newIndex;
        this.deckScrollTarget = newIndex;
        this.updateDeckCounterAndPagination();
    }

    getTodayDateStr() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    goToToday() {
        const now = new Date();
        this.currentYear = now.getFullYear();
        this.currentMonth = now.getMonth();
        this._deckUserNavigated = false;

        const todayStr = this.getTodayDateStr();
        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        let todayIdx = -1;
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (dateStr === todayStr) {
                todayIdx = day - 1;
                break;
            }
        }
        if (todayIdx >= 0) {
            this.deckIndex = todayIdx;
            this.deckScrollTarget = todayIdx;
            this.deckScrollCurrent = todayIdx;
        }

        this.renderCalendar();
        this.renderEntriesList();
        this.renderDeckView();

        if (this.calendarGrid) {
            const todayCell = this.calendarGrid.querySelector(`.calendar-day[data-date="${todayStr}"]`);
            if (todayCell) {
                todayCell.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }

    async loadJournals() {
        try {
            const response = await fetch('http://localhost:3000/api/journals');
            if (!response.ok) throw new Error('API request failed');
            this.journals = await response.json();
            Storage.set('dsa_journals', this.journals);
        } catch (e) {
            console.warn('Journals server unreachable, fallback to localStorage:', e);
            this.journals = Storage.get('dsa_journals') || [];
        }
        this.renderCalendar();
        this.renderEntriesList();
        this.renderDeckView();
    }

    renderCalendar() {
        if (!this.calendarGrid || !this.calendarMonthYear) return;

        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        this.calendarMonthYear.textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;

        const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(this.currentYear, this.currentMonth, 0).getDate();

        const todayStr = this.getTodayDateStr();

        const journalMap = {};
        (this.journals || []).forEach(j => {
            if (j.date) {
                if (!journalMap[j.date]) journalMap[j.date] = [];
                journalMap[j.date].push(j);
            }
        });

        let gridHTML = '';

        // Previous month filler days
        for (let i = firstDay - 1; i >= 0; i--) {
            const dayNum = daysInPrevMonth - i;
            const prevMonth = this.currentMonth === 0 ? 11 : this.currentMonth - 1;
            const prevYear = this.currentMonth === 0 ? this.currentYear - 1 : this.currentYear;
            const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            gridHTML += `
                <div class="calendar-day other-month" data-date="${dateStr}">
                    <div class="calendar-day-num">${dayNum}</div>
                </div>
            `;
        }

        // Current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const dayEntries = journalMap[dateStr] || [];
            
            let entryContentHTML = '';
            if (dayEntries.length > 0) {
                const latest = dayEntries[0];
                const displayTitle = latest.title ? latest.title : (latest.content.substring(0, 16) + '...');
                entryContentHTML = `
                    <div class="calendar-day-entry-badge" title="${this.escapeHTML(latest.title || latest.content)}">
                        ${this.escapeHTML(displayTitle)}
                    </div>
                `;
            } else {
                entryContentHTML = `<span class="calendar-day-add-hint">+ Write</span>`;
            }

            const dotHTML = dayEntries.length > 0 ? `<span class="calendar-day-dot"></span>` : '';

            gridHTML += `
                <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                    <div class="calendar-day-num">
                        <span>${day}</span>
                        ${dotHTML}
                    </div>
                    ${entryContentHTML}
                </div>
            `;
        }

        // Next month filler days to complete grid cells
        const totalCellsSoFar = firstDay + daysInMonth;
        const totalGridCells = totalCellsSoFar > 35 ? 42 : 35;
        const nextMonthDays = totalGridCells - totalCellsSoFar;

        for (let day = 1; day <= nextMonthDays; day++) {
            const nextMonth = this.currentMonth === 11 ? 0 : this.currentMonth + 1;
            const nextYear = this.currentMonth === 11 ? this.currentYear + 1 : this.currentYear;
            const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            gridHTML += `
                <div class="calendar-day other-month" data-date="${dateStr}">
                    <div class="calendar-day-num">${day}</div>
                </div>
            `;
        }

        this.calendarGrid.innerHTML = gridHTML;

        // Add click listener to all calendar days
        const dayElements = this.calendarGrid.querySelectorAll('.calendar-day');
        dayElements.forEach(el => {
            el.addEventListener('click', () => {
                const dateStr = el.getAttribute('data-date');
                if (dateStr) {
                    this.openModalForDate(dateStr);
                }
            });
        });
    }

    renderEntriesList() {
        if (!this.entriesList || !this.entriesCount || !this.emptyState) return;

        if (!this.journals || this.journals.length === 0) {
            this.entriesList.innerHTML = '';
            this.entriesCount.textContent = '0 entries';
            this.emptyState.classList.remove('hidden');
            return;
        }

        this.emptyState.classList.add('hidden');
        this.entriesCount.textContent = `${this.journals.length} ${this.journals.length === 1 ? 'entry' : 'entries'}`;

        const sorted = [...this.journals].sort((a, b) => {
            if (b.date !== a.date) return b.date.localeCompare(a.date);
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        let listHTML = '';
        sorted.forEach(entry => {
            const formattedDate = this.formatDateDisplay(entry.date);
            const titleHTML = entry.title ? `<div class="journal-entry-title">${this.escapeHTML(entry.title)}</div>` : '';
            const snippet = this.escapeHTML(entry.content);

            listHTML += `
                <div class="journal-entry-card" data-id="${entry.id}">
                    <div class="journal-entry-meta">
                        <span class="journal-entry-date-badge">📅 ${formattedDate}</span>
                        <div class="journal-entry-actions">
                            <button type="button" class="btn secondary sm btn-edit-journal" data-id="${entry.id}">Edit</button>
                            <button type="button" class="btn danger sm btn-delete-journal-item" data-id="${entry.id}">Delete</button>
                        </div>
                    </div>
                    ${titleHTML}
                    <div class="journal-entry-snippet">${snippet}</div>
                </div>
            `;
        });

        this.entriesList.innerHTML = listHTML;

        this.entriesList.querySelectorAll('.btn-edit-journal').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                const entry = this.journals.find(j => j.id === id);
                if (entry) {
                    this.openModalForEntry(entry);
                }
            });
        });

        this.entriesList.querySelectorAll('.btn-delete-journal-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-id');
                if (id) {
                    this.deleteEntry(id);
                }
            });
        });
    }

    formatDateDisplay(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return dateObj.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    openModalForDate(dateStr) {
        if (!dateStr) return;
        if (this._lastModalOpenedDate === dateStr && (Date.now() - (this._lastModalOpenedTime || 0)) < 300) {
            return;
        }
        this._lastModalOpenedDate = dateStr;
        this._lastModalOpenedTime = Date.now();

        const existingEntry = (this.journals || []).find(j => j.date === dateStr);
        if (existingEntry) {
            this.openModalForEntry(existingEntry);
        } else {
            const newId = 'journal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
            if (this.inputId) this.inputId.value = newId;
            if (this.inputDate) this.inputDate.value = dateStr;
            if (this.inputTitle) this.inputTitle.value = '';
            
            const draft = Storage.get(`journal_draft_${dateStr}`);
            if (draft) {
                if (this.inputTitle) this.inputTitle.value = draft.title || '';
                if (this.inputContent) this.inputContent.value = draft.content || '';
                if (this.draftIndicator) this.draftIndicator.classList.remove('hidden');
            } else {
                if (this.inputContent) this.inputContent.value = '';
                if (this.draftIndicator) this.draftIndicator.classList.add('hidden');
            }

            if (this.modalDateDisplay) this.modalDateDisplay.textContent = this.formatDateDisplay(dateStr);
            if (this.modalTitleDisplay) this.modalTitleDisplay.textContent = "What's on your mind?";
            if (this.btnDelete) this.btnDelete.classList.add('hidden');

            const saveBtn = document.getElementById('btn-save-journal');
            if (saveBtn) saveBtn.textContent = 'Save Entry';

            this.updateWordCount();
            this.showModal();
        }
    }

    openModalForEntry(entry) {
        if (this.inputId) this.inputId.value = entry.id;
        if (this.inputDate) this.inputDate.value = entry.date;
        if (this.inputTitle) this.inputTitle.value = entry.title || '';
        if (this.inputContent) this.inputContent.value = entry.content || '';
        if (this.modalDateDisplay) this.modalDateDisplay.textContent = this.formatDateDisplay(entry.date);
        if (this.modalTitleDisplay) this.modalTitleDisplay.textContent = "Edit Journal Entry";
        if (this.btnDelete) this.btnDelete.classList.remove('hidden');
        if (this.draftIndicator) this.draftIndicator.classList.add('hidden');

        const saveBtn = document.getElementById('btn-save-journal');
        if (saveBtn) saveBtn.textContent = 'Update Entry';

        this.updateWordCount();
        this.showModal();
    }

    showModal() {
        if (!this.modal) this.modal = document.getElementById('journal-modal');
        if (!this.backdrop) this.backdrop = document.getElementById('journal-modal-backdrop');

        if (this.modal) {
            if (this.backdrop) this.backdrop.classList.remove('hidden');
            this.modal.classList.remove('hidden');
            document.body.classList.add('body-scroll-locked');

            setTimeout(() => {
                if (this.backdrop) this.backdrop.classList.add('active');
                this.modal.classList.add('active');
                if (this.inputContent) this.inputContent.focus();
            }, 10);
        }
    }

    closeModal() {
        if (!this.modal) this.modal = document.getElementById('journal-modal');
        if (!this.backdrop) this.backdrop = document.getElementById('journal-modal-backdrop');

        if (this.modal) {
            const dateStr = (this.inputDate && this.inputDate.value) ? this.inputDate.value : this.getTodayDateStr();
            const content = this.inputContent ? this.inputContent.value.trim() : '';
            const title = this.inputTitle ? this.inputTitle.value.trim() : '';
            if (content) {
                Storage.set(`journal_draft_${dateStr}`, { title, content, savedAt: Date.now() });
            }

            this.modal.classList.remove('active');
            if (this.backdrop) this.backdrop.classList.remove('active');
            document.body.classList.remove('body-scroll-locked');
            
            setTimeout(() => {
                this.modal.classList.add('hidden');
                if (this.backdrop) this.backdrop.classList.add('hidden');
            }, 250);
        }
    }

    updateWordCount() {
        if (!this.inputContent || !this.wordCountBadge) return;
        const text = this.inputContent.value.trim();
        const wordCount = text ? text.split(/\s+/).length : 0;
        this.wordCountBadge.textContent = `${wordCount} ${wordCount === 1 ? 'word' : 'words'}`;
    }

    triggerDraftAutoSave() {
        const dateStr = (this.inputDate && this.inputDate.value) ? this.inputDate.value : this.getTodayDateStr();
        const title = this.inputTitle ? this.inputTitle.value : '';
        const content = this.inputContent ? this.inputContent.value : '';

        if (this.draftTimer) clearTimeout(this.draftTimer);
        this.draftTimer = setTimeout(() => {
            if (content.trim()) {
                Storage.set(`journal_draft_${dateStr}`, { title, content, savedAt: Date.now() });
                if (this.draftIndicator) {
                    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
        if (this._isSaving) return;
        this._isSaving = true;

        const saveBtn = document.getElementById('btn-save-journal');
        if (saveBtn) saveBtn.disabled = true;

        const id = (this.inputId && this.inputId.value) ? this.inputId.value : ('journal_' + Date.now());
        const date = (this.inputDate && this.inputDate.value) ? this.inputDate.value : this.getTodayDateStr();
        const title = this.inputTitle ? this.inputTitle.value.trim() : '';
        const content = this.inputContent ? this.inputContent.value.trim() : '';

        if (!content) {
            Toast.show('Please write something in your journal entry before saving.', 'error');
            this._isSaving = false;
            if (saveBtn) saveBtn.disabled = false;
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
        } finally {
            this._isSaving = false;
            if (saveBtn) saveBtn.disabled = false;
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