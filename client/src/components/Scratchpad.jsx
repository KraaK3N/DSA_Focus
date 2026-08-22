import { useEffect, useRef, useState } from 'react';
import api from '../utils/api';

export default function Scratchpad() {
  const editorRef = useRef(null);
  const slashMenuRef = useRef(null);
  const saveTimeoutRef = useRef(null);
  const activeBlockRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuQuery, setMenuQuery] = useState('');

  const MENU_ITEMS = [
    {
      cmd: 'todo',
      name: 'To-do List',
      desc: 'Create a checkbox task',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 11 12 14 22 4"></polyline>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
        </svg>
      ),
    },
    { cmd: 'bullet', name: 'Bullet List', desc: 'Create a bullet point', icon: '•' },
    { cmd: 'h1', name: 'Heading 1', desc: 'Large heading', icon: 'H1' },
    { cmd: 'h2', name: 'Heading 2', desc: 'Medium heading', icon: 'H2' },
    { cmd: 'divider', name: 'Divider', desc: 'Horizontal line', icon: '―' },
  ];

  const visibleItems = MENU_ITEMS.filter(
    (item) => item.cmd.startsWith(menuQuery) || item.name.toLowerCase().includes(menuQuery)
  );

  // Load content on mount
  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/settings/scratchpad');
        if (data && data.value && editorRef.current) {
          editorRef.current.innerHTML = data.value;
          return;
        }
      } catch (err) {
        // fallback
      }
      const local = localStorage.getItem('dsa_scratchpad');
      if (local && editorRef.current) {
        editorRef.current.innerHTML = local;
      }
    }
    load();
  }, []);

  async function saveContent() {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    localStorage.setItem('dsa_scratchpad', html);
    try {
      await api.post('/settings/scratchpad', { value: html });
    } catch (err) {
      // ignore
    }
  }

  function autoSave() {
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(saveContent, 1000);
  }

  function getCurrentBlock() {
    const editor = editorRef.current;
    if (!editor) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      return editor;
    }

    let node = selection.anchorNode;
    if (node.nodeType === Node.TEXT_NODE && node.parentNode === editor) {
      const block = document.createElement('div');
      block.className = 'scratch-paragraph';
      editor.insertBefore(block, node);
      block.appendChild(node);
      return block;
    }

    if (node === editor) {
      const child = editor.childNodes[selection.anchorOffset];
      if (child?.nodeType === Node.ELEMENT_NODE) {
        return child;
      }
      return editor;
    }

    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    while (el && el !== editor) {
      if (
        el.classList.contains('scratch-todo-row') ||
        el.classList.contains('scratch-bullet-row') ||
        el.classList.contains('scratch-paragraph') ||
        el.classList.contains('scratch-h1') ||
        el.classList.contains('scratch-h2') ||
        (el.parentNode === editor && (el.tagName === 'DIV' || el.tagName === 'P'))
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return editor;
  }

  function setCaretToEnd(element) {
    if (!element) return;
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function executeCommand(cmd) {
    setMenuOpen(false);
    const editor = editorRef.current;
    const block = activeBlockRef.current || getCurrentBlock() || editor;
    activeBlockRef.current = null;

    let text = block.textContent || '';
    text = text.replace(/\/[a-z0-9-]*$/i, '');
    text = text.replace(/^(\[\]|- \[ \]|-\s?|##\s?|#\s?|---\s?)/, '');
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
      setCaretToEnd(nextLine);
      saveContent();
      return;
    }

    if (newEl) {
      if (block === editor) {
        const children = Array.from(editor.childNodes);
        children.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) child.remove();
        });
        editor.appendChild(newEl);
      } else {
        block.parentNode.replaceChild(newEl, block);
      }

      if (cmd === 'todo') {
        setCaretToEnd(newEl.querySelector('.scratch-todo-text'));
      } else {
        setCaretToEnd(newEl);
      }
      saveContent();
    }
  }

  function handleEditorClick(e) {
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
        saveContent();
      }
    }
  }

  function handleEditorInput() {
    const editor = editorRef.current;
    autoSave();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) {
      setMenuOpen(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const block = getCurrentBlock();
    const root = block === editor ? editor : block;
    const beforeCaret = document.createRange();

    let textBeforeCaret = '';
    try {
      beforeCaret.selectNodeContents(root);
      beforeCaret.setEnd(range.endContainer, range.endOffset);
      textBeforeCaret = beforeCaret.toString().replace(/\u00a0/g, ' ');
    } catch {
      textBeforeCaret = '';
    }

    if (/^\s*\/[a-z0-9-]*$/i.test(textBeforeCaret)) {
      const queryMatch = textBeforeCaret.match(/\/([a-z0-9-]*)$/i);
      const q = queryMatch ? queryMatch[1].toLowerCase() : '';
      setMenuQuery(q);
      setSelectedIndex(0);

      activeBlockRef.current = block;

      const rect = range.getBoundingClientRect();
      const containerRect = editor.parentElement.getBoundingClientRect();
      setMenuPos({
        left: rect.left - containerRect.left,
        top: rect.bottom - containerRect.top + 8,
      });
      setMenuOpen(true);
    } else if (menuOpen) {
      setMenuOpen(false);
    }
  }

  function handleEditorKeyDown(e) {
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, visibleItems.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + visibleItems.length) % Math.max(1, visibleItems.length));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (visibleItems[selectedIndex]) {
          executeCommand(visibleItems[selectedIndex].cmd);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        return;
      }
    }

    if (e.key === 'Enter') {
      const block = getCurrentBlock();
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
          setCaretToEnd(newTodo.querySelector('.scratch-todo-text'));
          saveContent();
          return;
        }

        if (bulletRow) {
          e.preventDefault();
          const newBullet = document.createElement('div');
          newBullet.className = 'scratch-bullet-row';
          newBullet.setAttribute('data-placeholder', 'List item...');
          newBullet.textContent = '';
          bulletRow.parentNode.insertBefore(newBullet, bulletRow.nextSibling);
          setCaretToEnd(newBullet);
          saveContent();
          return;
        }
      }
    }

    if (e.key === 'Backspace') {
      const block = getCurrentBlock();
      if (block) {
        const todoRow = block.closest('.scratch-todo-row');
        const bulletRow = block.closest('.scratch-bullet-row');

        if (todoRow) {
          const text = todoRow.querySelector('.scratch-todo-text')?.textContent || '';
          if (text.length === 0) {
            e.preventDefault();
            const newBlock = document.createElement('div');
            newBlock.innerHTML = '&nbsp;';
            todoRow.parentNode.replaceChild(newBlock, todoRow);
            setCaretToEnd(newBlock);
            saveContent();
            return;
          }
        }

        if (bulletRow) {
          const text = (bulletRow.textContent || '').replace(/\s/g, '');
          if (text.length === 0) {
            e.preventDefault();
            const newBlock = document.createElement('div');
            newBlock.innerHTML = '&nbsp;';
            bulletRow.parentNode.replaceChild(newBlock, bulletRow);
            setCaretToEnd(newBlock);
            saveContent();
            return;
          }
        }
      }
    }

    if (e.key === ' ') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const block = getCurrentBlock();
        if (block) {
          const blockText = block.innerText || block.textContent || '';
          const textBeforeCursor = blockText.slice(0, range.startOffset).trim();

          if (textBeforeCursor === '[]' || textBeforeCursor === '- [ ]') {
            e.preventDefault();
            executeCommand('todo');
          } else if (textBeforeCursor === '-') {
            e.preventDefault();
            executeCommand('bullet');
          } else if (textBeforeCursor === '#') {
            e.preventDefault();
            executeCommand('h1');
          } else if (textBeforeCursor === '##') {
            e.preventDefault();
            executeCommand('h2');
          } else if (textBeforeCursor === '---') {
            e.preventDefault();
            executeCommand('divider');
          }
        }
      }
    }
  }

  function handleClear() {
    if (window.confirm('Are you sure you want to clear the scratch board?')) {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        saveContent();
      }
    }
  }

  return (
    <div className="card scratchpad-card">
      <div className="scratchpad-header">
        <div className="eyebrow scratchpad-label">Scratch Pad</div>
        <div className="scratchpad-actions">
          <button
            type="button"
            className="btn-scratch-tool"
            id="btn-scratch-clear"
            title="Clear board"
            aria-label="Clear scratch board"
            onClick={handleClear}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <div className="scratchpad-body" style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          id="scratchpad-editor"
          className="scratchpad-editor"
          contentEditable="true"
          role="textbox"
          aria-multiline="true"
          placeholder="Start typing here…"
          onInput={handleEditorInput}
          onClick={handleEditorClick}
          onKeyDown={handleEditorKeyDown}
        ></div>

        {/* Floating Slash Menu matching v1_df */}
        {menuOpen && visibleItems.length > 0 && (
          <div
            ref={slashMenuRef}
            id="scratchpad-slash-menu"
            className="slash-menu"
            style={{ left: `${menuPos.left}px`, top: `${menuPos.top}px` }}
          >
            <div className="slash-menu-header">Slash Commands</div>
            {visibleItems.map((item, idx) => (
              <div
                key={item.cmd}
                className={`slash-item ${idx === selectedIndex ? 'selected' : ''}`}
                data-cmd={item.cmd}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => executeCommand(item.cmd)}
              >
                <span className="icon">{item.icon}</span>
                <div className="details">
                  <span className="name">{item.name}</span>
                  <span className="desc">{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="scratchpad-footer">
        <span><code>/</code> blocks · <code>[]</code> to-do · <code>-</code> bullet · <code>#</code> heading</span>
      </div>
    </div>
  );
}
