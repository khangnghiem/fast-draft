/**
 * AI Chat — Multi-Turn Agent panel for Fast Draft playground.
 *
 * Provides a conversational interface where users can discuss their
 * design and request modifications. Supports:
 *   - Multi-turn conversation with context
 *   - Automatic document context injection
 *   - Selection context injection (selected nodes' FD code)
 *   - Per-block accept/reject with smart replace (in-place node update)
 *   - Quick-action chips that adapt to selection state
 *   - Markdown rendering in responses
 */

// ─── State ──────────────────────────────────────────────

const chatHistory = [];
let isSending = false;
const AI_ENDPOINT = '/api/ai';

/** @type {Function|null} Getter for FdCanvas reference */
let _getCanvas = null;

// ─── DOM References ─────────────────────────────────────

function getChatPanel() { return document.getElementById('ai-chat-panel'); }
function getChatMessages() { return document.getElementById('ai-chat-messages'); }
function getChatInput() { return document.getElementById('ai-chat-input'); }
function getChatSend() { return document.getElementById('ai-chat-send'); }
function getChatBtn() { return document.getElementById('ai-chat-btn'); }
function getChatClose() { return document.getElementById('ai-chat-close'); }
function getContextBadge() { return document.getElementById('ai-chat-context-badge'); }
function getChipsContainer() { return document.getElementById('ai-chat-chips'); }

// ─── Panel Toggle ───────────────────────────────────────

export function toggleChatPanel() {
  const panel = getChatPanel();
  if (!panel) return;
  const willOpen = panel.classList.contains('hidden');
  if (willOpen) {
    // Exclusive right-side: close Specs panel when opening Chat
    const notesPanel = document.getElementById('specs-panel');
    if (notesPanel && !notesPanel.classList.contains('hidden')) {
      notesPanel.classList.add('hidden');
      if (typeof window._specsPanelOpen !== 'undefined') window._specsPanelOpen = false;
    }
  }
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    const input = getChatInput();
    if (input) input.focus();
    updateContextBadge();
    updateChips();
  }
}

export function closeChatPanel() {
  const panel = getChatPanel();
  if (panel) panel.classList.add('hidden');
}

export function clearChatHistory() {
  chatHistory.length = 0;
  const messages = getChatMessages();
  if (messages) {
    messages.innerHTML = '<div class="ai-chat-welcome"><p>Ask me about your design. I can modify nodes, suggest improvements, or answer questions.</p><p class="ai-chat-hint">Try: "Make the colors warmer" or "Add a header section"</p></div>';
  }
}

// ─── Selection Context ──────────────────────────────────

/**
 * Get current selection context from FdCanvas.
 * @returns {{ ids: string[], fdCode: string }} Selected node IDs and their FD code
 */
function getSelectionContext() {
  if (!_getCanvas) return { ids: [], fdCode: '' };
  const canvas = _getCanvas();
  if (!canvas) return { ids: [], fdCode: '' };

  let ids = [];
  try {
    const idsJson = canvas.get_selected_ids?.();
    if (idsJson) ids = JSON.parse(idsJson);
  } catch (_) {}
  if (ids.length === 0) {
    try {
      const singleId = canvas.get_selected_id?.();
      if (singleId) ids = [singleId];
    } catch (_) {}
  }

  let fdCode = '';
  if (ids.length > 0) {
    try {
      fdCode = canvas.emit_selection_fd?.() || '';
    } catch (_) {}
  }

  return { ids, fdCode };
}

/**
 * Update the context badge above the input to show what's selected.
 */
function updateContextBadge() {
  const badge = getContextBadge();
  if (!badge) return;

  const { ids } = getSelectionContext();
  if (ids.length === 0) {
    badge.classList.add('hidden');
    badge.textContent = '';
  } else if (ids.length === 1) {
    badge.classList.remove('hidden');
    badge.textContent = `📌 @${ids[0]}`;
  } else {
    badge.classList.remove('hidden');
    badge.textContent = `📌 ${ids.length} nodes selected`;
  }
}

// ─── Quick-Action Chips ─────────────────────────────────

const CHIPS_NONE = [
  { label: '🎨 Improve colors', msg: 'Improve the color palette to be more harmonious and modern' },
  { label: '📐 Add header', msg: 'Add a header section to the design' },
  { label: '✦ Review design', msg: 'Review my design and suggest improvements' },
];

const CHIPS_SINGLE = [
  { label: '🎨 Restyle', msg: 'Improve the styling of this node — better colors, corner radius, shadow' },
  { label: '📝 Rename', msg: 'Suggest a better semantic name for this node' },
  { label: '✨ Add hover', msg: 'Add a subtle hover animation to this node' },
];

const CHIPS_MULTI = [
  { label: '📦 Group these', msg: 'Group these selected nodes into a frame with proper layout' },
  { label: '📐 Align layout', msg: 'Align and arrange these nodes in a clean layout' },
  { label: '🔗 Add edges', msg: 'Add connecting edges between these nodes' },
];

function updateChips() {
  const container = getChipsContainer();
  if (!container) return;

  const { ids } = getSelectionContext();
  let chips;
  if (ids.length === 0) chips = CHIPS_NONE;
  else if (ids.length === 1) chips = CHIPS_SINGLE;
  else chips = CHIPS_MULTI;

  container.innerHTML = '';
  for (const chip of chips) {
    const btn = document.createElement('button');
    btn.className = 'ai-chat-chip';
    btn.textContent = chip.label;
    btn.addEventListener('click', () => {
      const input = getChatInput();
      if (input) {
        input.value = chip.msg;
        input.dispatchEvent(new Event('input'));
      }
      sendMessage(_lastGetEditor, _lastSetEditor);
    });
    container.appendChild(btn);
  }
}

// ─── Message Rendering ──────────────────────────────────

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render assistant response with markdown support and
 * per-block accept/reject buttons for FD code blocks.
 * Smart replace: finds matching @id in document and replaces in-place.
 */
function renderAssistantMessage(content, getEditorContent, setEditorContent) {
  const parts = content.split(/(```fd\n[\s\S]*?```)/g);
  let html = '';
  let blockIndex = 0;

  for (const part of parts) {
    const fdMatch = part.match(/```fd\n([\s\S]*?)```/);
    if (fdMatch) {
      const fdCode = fdMatch[1].trim();
      const bid = `fd-block-${Date.now()}-${blockIndex++}`;
      html += `<pre><code>${escapeHtml(fdCode)}</code></pre>`;
      html += `<div class="fd-block-action" data-bid="${bid}">`;
      html += `<button class="fd-apply-btn" data-fd="${encodeURIComponent(fdCode)}" data-bid="${bid}">✓ Apply</button>`;
      html += `<button class="fd-reject-btn" data-bid="${bid}">✕ Skip</button>`;
      html += '</div>';
    } else {
      let md = escapeHtml(part);
      md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
      md = md.replace(/\n/g, '<br>');
      html += md;
    }
  }

  return html;
}

/**
 * Smart Replace: find the node @id in the FD code block and replace
 * the matching node block in the document in-place.
 * Falls back to append if no matching node is found.
 */
function smartApplyFdCode(fdCode, getEditorContent, setEditorContent) {
  if (!getEditorContent || !setEditorContent) return;

  const current = getEditorContent();

  // Extract node @ids from the incoming FD code
  const nodeIdMatches = [...fdCode.matchAll(/^(?:rect|ellipse|text|frame|group|path|image|edge)\s+@(\w+)/gm)];

  if (nodeIdMatches.length === 0) {
    // No recognizable node — append
    setEditorContent(current.trimEnd() + '\n\n' + fdCode + '\n');
    return;
  }

  let result = current;
  let anyReplaced = false;

  for (const match of nodeIdMatches) {
    const nodeId = match[1];
    // Find the existing block for this @id in the document
    const blockRange = findNodeBlock(result, nodeId);
    if (blockRange) {
      // Extract the NEW block for this node from the AI's output
      const newBlock = extractNodeBlock(fdCode, nodeId);
      if (newBlock) {
        result = result.slice(0, blockRange.start) + newBlock + result.slice(blockRange.end);
        anyReplaced = true;
      }
    }
  }

  if (!anyReplaced) {
    // None of the nodes exist yet — append all
    result = result.trimEnd() + '\n\n' + fdCode + '\n';
  }

  setEditorContent(result);
}

/**
 * Find a node block in FD text by its @id.
 * Returns { start, end } character offsets or null.
 */
function findNodeBlock(source, nodeId) {
  // Match node declaration: type @nodeId ... {
  const regex = new RegExp(
    `^((?:rect|ellipse|text|frame|group|path|image|edge|style)\\s+@${nodeId}(?:\\s|\\{))`,
    'm'
  );
  const match = source.match(regex);
  if (!match) return null;

  const start = source.indexOf(match[0]);
  if (start === -1) return null;

  // Find matching closing brace
  let depth = 0;
  let i = start;
  let foundOpen = false;
  while (i < source.length) {
    if (source[i] === '{') { depth++; foundOpen = true; }
    if (source[i] === '}') { depth--; }
    if (foundOpen && depth === 0) {
      // Include trailing newline if present
      let end = i + 1;
      while (end < source.length && source[end] === '\n') end++;
      return { start, end };
    }
    i++;
  }

  // No braces found — single-line node
  const lineEnd = source.indexOf('\n', start);
  return { start, end: lineEnd === -1 ? source.length : lineEnd + 1 };
}

/**
 * Extract a single node block from FD text by its @id.
 */
function extractNodeBlock(source, nodeId) {
  const range = findNodeBlock(source, nodeId);
  if (!range) return null;
  return source.slice(range.start, range.end).trim() + '\n';
}

// ─── Message Addition ───────────────────────────────────

function addMessage(role, content, getEditorContent, setEditorContent) {
  const messages = getChatMessages();
  if (!messages) return;

  // Remove welcome message
  const welcome = messages.querySelector('.ai-chat-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `ai-chat-msg ${role}`;

  if (role === 'user') {
    div.textContent = content;
  } else if (role === 'thinking') {
    div.textContent = '✦ Thinking…';
  } else {
    div.innerHTML = renderAssistantMessage(content, getEditorContent, setEditorContent);

    // Wire up accept/reject buttons with smart replace
    div.querySelectorAll('.fd-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fdCode = decodeURIComponent(btn.dataset.fd);
        const actionDiv = btn.closest('.fd-block-action');
        smartApplyFdCode(fdCode, getEditorContent, setEditorContent);
        if (actionDiv) {
          actionDiv.innerHTML = '<span style="color:#34C759;font-size:10px;font-weight:600">✓ Applied</span>';
        }
      });
    });

    div.querySelectorAll('.fd-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionDiv = btn.closest('.fd-block-action');
        if (actionDiv) {
          actionDiv.innerHTML = '<span style="color:#86868B;font-size:10px;font-style:italic">Skipped</span>';
        }
      });
    });
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

// ─── Send Message ───────────────────────────────────────

let _lastGetEditor = null;
let _lastSetEditor = null;

async function sendMessage(getEditorContent, setEditorContent) {
  const input = getChatInput();
  const sendBtn = getChatSend();
  if (!input || isSending) return;

  const text = input.value.trim();
  if (!text) return;

  isSending = true;
  if (sendBtn) sendBtn.disabled = true;
  input.value = '';
  input.style.height = 'auto';

  // Get selection context
  const { ids: selIds, fdCode: selFd } = getSelectionContext();

  // Build display message (show context if any)
  let displayMsg = text;
  if (selIds.length > 0) {
    displayMsg = `[📌 ${selIds.map(id => '@' + id).join(', ')}] ${text}`;
  }

  // Add user message
  chatHistory.push({ role: 'user', content: text });
  addMessage('user', displayMsg);

  // Show thinking indicator
  const thinkingDiv = addMessage('thinking', '');

  try {
    // Get current document context
    const docContent = getEditorContent ? getEditorContent() : '';

    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        messages: chatHistory,
        context: docContent.slice(0, 8000),
        selection: selFd ? selFd.slice(0, 4000) : undefined,
        selection_ids: selIds.length > 0 ? selIds : undefined,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }

    // Remove thinking indicator
    if (thinkingDiv) thinkingDiv.remove();

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && response.body) {
      // ─── SSE Streaming ─────────────────────────────
      const messages = getChatMessages();
      const div = document.createElement('div');
      div.className = 'ai-chat-msg assistant';

      // Remove welcome message
      const welcome = messages?.querySelector('.ai-chat-welcome');
      if (welcome) welcome.remove();
      messages?.appendChild(div);

      let accumulated = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const parsed = JSON.parse(payload);
            const token = parsed.response || '';
            if (token) {
              accumulated += token;
              // Live preview: render as escaped text (fast, no layout thrash)
              div.textContent = accumulated;
              messages.scrollTop = messages.scrollHeight;
            }
          } catch (_) {}
        }
      }

      // Finalize: re-render with full markdown + Apply/Skip buttons
      const finalContent = accumulated || 'No response received.';
      chatHistory.push({ role: 'assistant', content: finalContent });
      div.innerHTML = renderAssistantMessage(finalContent, getEditorContent, setEditorContent);

      // Wire apply/reject buttons
      div.querySelectorAll('.fd-apply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fdCode = decodeURIComponent(btn.dataset.fd);
          const actionDiv = btn.closest('.fd-block-action');
          smartApplyFdCode(fdCode, getEditorContent, setEditorContent);
          if (actionDiv) actionDiv.innerHTML = '<span style="color:#34C759;font-size:10px;font-weight:600">✓ Applied</span>';
        });
      });
      div.querySelectorAll('.fd-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const actionDiv = btn.closest('.fd-block-action');
          if (actionDiv) actionDiv.innerHTML = '<span style="color:#86868B;font-size:10px;font-style:italic">Skipped</span>';
        });
      });
      messages.scrollTop = messages.scrollHeight;
    } else {
      // ─── Fallback: full JSON response ──────────────
      const data = await response.json();
      const assistantContent = data.result || 'No response received.';
      chatHistory.push({ role: 'assistant', content: assistantContent });
      addMessage('assistant', assistantContent, getEditorContent, setEditorContent);
    }
  } catch (err) {
    if (thinkingDiv) thinkingDiv.remove();
    addMessage('assistant', `⚠️ Error: ${err.message}`, getEditorContent, setEditorContent);
  } finally {
    isSending = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// ─── Auto-Resize Textarea ───────────────────────────────

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
}

// ─── Initialization ─────────────────────────────────────

/**
 * Initialize the AI Chat panel. Call after DOM is ready.
 *
 * @param {Function} getEditorContent - Returns the current FD text
 * @param {Function} setEditorContent - Sets the editor FD text
 * @param {Function} [getCanvas] - Returns the FdCanvas WASM instance
 */
export function initAiChat(getEditorContent, setEditorContent, getCanvas) {
  _lastGetEditor = getEditorContent;
  _lastSetEditor = setEditorContent;
  _getCanvas = getCanvas || null;

  const chatBtn = getChatBtn();
  const closeBtn = getChatClose();
  const sendBtn = getChatSend();
  const input = getChatInput();

  if (chatBtn) {
    chatBtn.addEventListener('click', toggleChatPanel);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeChatPanel);
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      sendMessage(getEditorContent, setEditorContent);
    });
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(getEditorContent, setEditorContent);
      }
    });

    input.addEventListener('input', () => autoResize(input));

    // Update context badge on focus (selection may have changed)
    input.addEventListener('focus', () => {
      updateContextBadge();
      updateChips();
    });
  }

  // Listen for selection changes to update context badge when panel is visible
  document.addEventListener('fd-selection-changed', () => {
    const panel = getChatPanel();
    if (panel && !panel.classList.contains('hidden')) {
      updateContextBadge();
      updateChips();
    }
  });

  // Initial chips render
  updateChips();
}
