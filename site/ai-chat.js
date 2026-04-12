/**
 * AI Chat — Multi-Turn Agent panel for Fast Draft web editor.
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
let currentAbortController = null;
const AI_ENDPOINT = '/api/ai';

/** @type {Function|null} Getter for FdCanvas reference */
let _getCanvas = null;

// ─── DOM References ─────────────────────────────────────

function getChatPanel() { return document.getElementById('rp-agent-content'); }
function getChatMessages() { return document.getElementById('ai-chat-messages'); }
function getChatInput() { return document.getElementById('ai-chat-input'); }
function getChatSend() { return document.getElementById('ai-chat-send'); }
function getChatBtn() { return document.getElementById('ai-chat-btn'); }
function getChatClose() { return document.getElementById('ai-chat-close'); }
function getContextBadge() { return document.getElementById('ai-chat-context-badge'); }
function getChipsContainer() { return document.getElementById('ai-chat-chips'); }

// ─── Panel Toggle ───────────────────────────────────────

export function toggleChatPanel() {
  // In unified right panel, just switch to Agent tab
  if (typeof switchRightTab === 'function') {
    switchRightTab('agent');
  } else if (typeof window.switchRightTab === 'function') {
    window.switchRightTab('agent');
  }
  const panel = getChatPanel();
  if (panel) {
    const input = getChatInput();
    if (input) input.focus();
    updateContextBadge();
    updateChips();
  }
}

export function closeChatPanel() {
  // No-op in unified right panel — Agent tab stays accessible via tabs
}

export function clearChatHistory() {
  chatHistory.length = 0;
  const messages = getChatMessages();
  if (messages) {
    messages.innerHTML = `<div class="ai-chat-welcome" id="ai-chat-welcome">
      <div class="ai-chat-welcome-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M12 2l2.4 7.6 7.6 2.4-7.6 2.4-2.4 7.6-2.4-7.6-7.6-2.4 7.6-2.4 2.4-7.6z"/>
          <path d="M5 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" opacity="0.6"/>
        </svg>
      </div>
      <div class="ai-chat-welcome-text">Design Agent</div>
      <div class="ai-chat-welcome-subtext">Select components, describe changes</div>
      <div class="ai-chat-chips" id="ai-chat-chips"></div>
    </div>`;
    updateChips();
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
export function updateContextBadge() {
  const badge = getContextBadge();
  const textEl = document.getElementById('ai-chat-context-text');
  if (!badge) return;

  const { ids } = getSelectionContext();
  if (ids.length === 0) {
    badge.classList.add('hidden');
    if (textEl) textEl.textContent = '';
  } else if (ids.length === 1) {
    badge.classList.remove('hidden');
    if (textEl) textEl.textContent = `📌 @${ids[0]}`;
  } else {
    badge.classList.remove('hidden');
    if (textEl) textEl.textContent = `📌 ${ids.length} selected`;
  }
}

// ─── Quick-Action Chips ─────────────────────────────────

const CHIPS_NONE = [
  { label: 'Suggest Variants', msg: 'Suggest layout or color variants for this design' },
  { label: 'Edit Style', msg: 'Improve the color palette to be more harmonious and modern' },
  { label: 'Align Objects', msg: 'Align and arrange the layout cleanly' },
];

const CHIPS_SINGLE = [
  { label: 'Suggest Variants', msg: 'Suggest variations for this component' },
  { label: 'Edit Style', msg: 'Improve the styling of this node' },
  { label: 'Rename Node', msg: 'Suggest a better semantic name for this node' },
];

const CHIPS_MULTI = [
  { label: 'Group Nodes', msg: 'Group these selected nodes into a frame with proper layout' },
  { label: 'Align Objects', msg: 'Align and arrange these nodes in a clean layout' },
  { label: 'Add Edges', msg: 'Add connecting edges between these nodes' },
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function wireApplySkipButtons(container, getEditorContent, setEditorContent) {
  container.querySelectorAll('.fd-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const fdCode = decodeURIComponent(btn.dataset.fd);
      const actionDiv = btn.closest('.fd-block-action');
      smartApplyFdCode(fdCode, getEditorContent, setEditorContent);
      if (actionDiv) {
        actionDiv.innerHTML = '<span style="color:#34C759;font-size:10px;font-weight:600">✓ Applied</span>';
      }
    });
  });

  container.querySelectorAll('.fd-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const actionDiv = btn.closest('.fd-block-action');
      if (actionDiv) {
        actionDiv.innerHTML = '<span style="color:#86868B;font-size:10px;font-style:italic">Skipped</span>';
      }
    });
  });
}

function updateRateLimitUI(remaining, limit) {
  let rateEl = document.getElementById('ai-rate-limit');
  if (!rateEl) {
    rateEl = document.createElement('div');
    rateEl.id = 'ai-rate-limit';
    rateEl.className = 'ai-rate-limit-text';
    const footer = document.querySelector('.ai-chat-input-footer');
    const sendBtn = getChatSend();
    if (footer && sendBtn) {
      footer.insertBefore(rateEl, sendBtn);
    }
  }
  
  const rem = parseInt(remaining, 10);
  rateEl.textContent = `${remaining}/${limit} remaining`;
  
  if (!isNaN(rem) && rem <= 3) {
    rateEl.classList.add('warning');
  } else {
    rateEl.classList.remove('warning');
  }
}
window.updateRateLimitUI = updateRateLimitUI;

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
    const unsafeHTML = renderAssistantMessage(content, getEditorContent, setEditorContent);
    div.innerHTML = window.DOMPurify ? DOMPurify.sanitize(unsafeHTML, { ADD_ATTR: ['data-fd', 'data-bid'] }) : unsafeHTML;
    wireApplySkipButtons(div, getEditorContent, setEditorContent);
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
  currentAbortController = new AbortController();
  if (sendBtn) {
    sendBtn.innerHTML = '■';
    sendBtn.title = 'Stop Generating';
    sendBtn.classList.add('stop-mode');
  }
  input.value = '';
  input.style.height = 'auto';

  // Get selection context
  const { ids: selIds, fdCode: selFd } = getSelectionContext();

  // Build display message (show context if any)
  let displayMsg = text;
  // If user included a specific @id in their text, don't prepend context ids
  if (selIds.length > 0 && !text.includes('@')) {
    displayMsg = `[📌 ${selIds.map(id => '@' + id).join(', ')}] ${text}`;
  }
  const displayLine = addMessage('user', displayMsg, getEditorContent, setEditorContent);

  // Re-hide welcome chips
  const welcome = document.getElementById('ai-chat-welcome');
  if (welcome) welcome.style.display = 'none';

  // Add user message
  chatHistory.push({ role: 'user', content: text });

  // Show thinking indicator
  const thinkingDiv = addMessage('thinking', '');

  try {
    // Get current document context
    const canvas = _getCanvas ? _getCanvas() : null;
    let docContent;
    if (canvas && typeof canvas.emit_filtered === 'function') {
      const styles = canvas.emit_filtered('Design') || '';
      const structure = canvas.emit_filtered('Structure') || '';
      docContent = {
        styles: styles.slice(0, 2000),
        structure: structure.slice(0, 3000)
      };
    } else {
      docContent = getEditorContent ? getEditorContent().slice(0, 8000) : '';
    }

    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      signal: currentAbortController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        messages: chatHistory,
        context: docContent,
        selection: selFd ? selFd.slice(0, 4000) : undefined,
        selection_ids: selIds.length > 0 ? selIds : undefined,
        stream: true,
        model_hint: new URLSearchParams(window.location.search).get('ai_model') || undefined,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }

    // Remove thinking indicator
    if (thinkingDiv) thinkingDiv.remove();

    const limit = response.headers.get('x-ratelimit-limit');
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (limit && remaining) updateRateLimitUI(remaining, limit);

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
      let renderPending = false;

      const performRender = () => {
        const unsafeHTML = renderAssistantMessage(accumulated, getEditorContent, setEditorContent) + '<span class="ai-cursor">█</span>';
        div.innerHTML = window.DOMPurify ? DOMPurify.sanitize(unsafeHTML, { ADD_ATTR: ['data-fd', 'data-bid'] }) : unsafeHTML;
        messages.scrollTop = messages.scrollHeight;
        renderPending = false;
      };

      try {
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
                if (!renderPending) {
                  renderPending = true;
                  requestAnimationFrame(performRender);
                }
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          accumulated += '\n\n*(Stopped)*';
        } else {
          throw e;
        }
      }

      // Finalize: re-render with full markdown + Apply/Skip buttons
      const finalContent = accumulated || 'No response received.';
      chatHistory.push({ role: 'assistant', content: finalContent });
      const finalUnsafeHTML = renderAssistantMessage(finalContent, getEditorContent, setEditorContent);
      div.innerHTML = window.DOMPurify ? DOMPurify.sanitize(finalUnsafeHTML, { ADD_ATTR: ['data-fd', 'data-bid'] }) : finalUnsafeHTML;
      wireApplySkipButtons(div, getEditorContent, setEditorContent);
      messages.scrollTop = messages.scrollHeight;
    } else {
      // ─── Fallback: full JSON response ──────────────
      const data = await response.json();
      if (data.limit && data.remaining) updateRateLimitUI(data.remaining, data.limit);
      const assistantContent = data.result || 'No response received.';
      chatHistory.push({ role: 'assistant', content: assistantContent });
      addMessage('assistant', assistantContent, getEditorContent, setEditorContent);
    }
  } catch (err) {
    if (thinkingDiv) thinkingDiv.remove();
    if (err.name !== 'AbortError') {
      addMessage('assistant', `⚠️ Error: ${err.message}`, getEditorContent, setEditorContent);
    }
  } finally {
    isSending = false;
    currentAbortController = null;
    if (sendBtn) {
      sendBtn.innerHTML = '→';
      sendBtn.title = 'Send';
      sendBtn.classList.remove('stop-mode');
    }
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
      if (isSending && currentAbortController) {
        currentAbortController.abort();
      } else {
        sendMessage(getEditorContent, setEditorContent);
      }
    });
  }

  // Model selector removed (locked to Gemma 4)

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (isSending && currentAbortController) {
          currentAbortController.abort();
        } else {
          sendMessage(getEditorContent, setEditorContent);
        }
      }
    });

    input.addEventListener('input', () => autoResize(input));

    // Update context badge on focus (selection may have changed)
    input.addEventListener('focus', () => {
      updateContextBadge();
      updateChips();
    });
  }

  const clearCtxBtn = document.getElementById('ai-chat-context-clear');
  if (clearCtxBtn) {
    clearCtxBtn.addEventListener('click', () => {
      if (_getCanvas) {
        try {
          const canvas = _getCanvas();
          if (canvas.clear_selection) canvas.clear_selection();
        } catch (_) {}
      }
      updateContextBadge();
      updateChips();
    });
  }

  // Clear chat button located in the panel/tabs
  const clearChatBtn = document.getElementById('ai-chat-clear');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      clearChatHistory();
    });
  }

  // Listen for selection changes to update context badge when panel is visible
  document.addEventListener('fd-selection-changed', () => {
    const panel = getChatPanel();
    if (panel) {
      updateContextBadge();
      updateChips();
    }
  });

  // Initial chips render
  updateChips();
}
