// ─── ai-chat.js ─── AI Agent chat panel for VS Code extension
// This file is part of the FD webview module system.
// Build with: pnpm run build:webview

// ─── AI Chat ────────────────────────────────────────────────────────────

const AI_ENDPOINT = 'https://fast-draft.com/api/ai';

/** Chat conversation history for multi-turn context. */
const chatHistory = [];
let aiChatSending = false;

// ─── Quick-Action Chips ─────────────────────────────────

const CHIPS_NONE = [
  { label: 'Suggest Variants', msg: 'Suggest layout variants or styling improvements for the current design' },
  { label: 'Edit Style', msg: 'Update the global theme colors and typography' },
  { label: 'Review Design', msg: 'Review my design against Apple HIG and suggest improvements' },
];

const CHIPS_SINGLE = [
  { label: 'Suggest Variants', msg: 'Suggest styling variants for this node — better colors, corner radius, shadow' },
  { label: 'Edit Style', msg: 'Change the visual style properties of this widget' },
  { label: 'Add Hover State', msg: 'Add a subtle interactive hover animation to this node' },
];

const CHIPS_MULTI = [
  { label: 'Suggest Variants', msg: 'Suggest structural variants for these selected nodes' },
  { label: 'Align Objects', msg: 'Align and arrange these nodes in a clean, consistent layout' },
  { label: 'Review Design', msg: 'Review the layout and hierarchy of these selected nodes' },
];

// ─── Selection Context ──────────────────────────────────

function getSelectionContext() {
  if (!fdCanvas) return { ids: [], fdCode: '' };
  let ids = [];
  try {
    const idsJson = fdCanvas.get_selected_ids?.();
    if (idsJson) ids = JSON.parse(idsJson);
  } catch (_) {}
  if (ids.length === 0) {
    try {
      const singleId = fdCanvas.get_selected_id?.();
      if (singleId) ids = [singleId];
    } catch (_) {}
  }
  let fdCode = '';
  if (ids.length > 0) {
    try { fdCode = fdCanvas.emit_selection_fd?.() || ''; } catch (_) {}
  }
  return { ids, fdCode };
}

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

function updateChatChips() {
  const container = document.getElementById('ai-chat-chips');
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
      const input = document.getElementById('ai-chat-input');
      if (input) {
        input.value = chip.msg;
        input.dispatchEvent(new Event('input'));
      }
      sendChatMessage();
    });
    container.appendChild(btn);
  }
}

// ─── Message Rendering ──────────────────────────────────

function escapeHtmlChat(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderAssistantHtml(content) {
  const parts = content.split(/(```fd\n[\s\S]*?```)/g);
  let html = '';
  let blockIndex = 0;
  for (const part of parts) {
    const fdMatch = part.match(/```fd\n([\s\S]*?)```/);
    if (fdMatch) {
      const fdCode = fdMatch[1].trim();
      const bid = `fd-block-${Date.now()}-${blockIndex++}`;
      html += `<pre><code>${escapeHtmlChat(fdCode)}</code></pre>`;
      html += `<div class="fd-block-action" data-bid="${bid}">`;
      html += `<button class="fd-apply-btn" data-fd="${encodeURIComponent(fdCode)}" data-bid="${bid}">✓ Apply</button>`;
      html += `<button class="fd-reject-btn" data-bid="${bid}">✕ Skip</button>`;
      html += '</div>';
    } else {
      let md = escapeHtmlChat(part);
      md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
      md = md.replace(/\n/g, '<br>');
      html += md;
    }
  }
  return html;
}

// ─── Smart Replace ──────────────────────────────────────

function findNodeBlock(source, nodeId) {
  const regex = new RegExp(
    `^((?:rect|ellipse|text|frame|group|path|image|edge|style)\\s+@${nodeId}(?:\\s|\\{))`, 'm'
  );
  const match = source.match(regex);
  if (!match) return null;
  const start = source.indexOf(match[0]);
  if (start === -1) return null;
  let depth = 0, i = start, foundOpen = false;
  while (i < source.length) {
    if (source[i] === '{') { depth++; foundOpen = true; }
    if (source[i] === '}') { depth--; }
    if (foundOpen && depth === 0) {
      let end = i + 1;
      while (end < source.length && source[end] === '\n') end++;
      return { start, end };
    }
    i++;
  }
  const lineEnd = source.indexOf('\n', start);
  return { start, end: lineEnd === -1 ? source.length : lineEnd + 1 };
}

function extractNodeBlock(source, nodeId) {
  const range = findNodeBlock(source, nodeId);
  if (!range) return null;
  return source.slice(range.start, range.end).trim() + '\n';
}

function smartApplyFdCode(fdCode) {
  if (!fdCanvas) return;
  const current = fdCanvas.get_text();
  const nodeIdMatches = [...fdCode.matchAll(/^(?:rect|ellipse|text|frame|group|path|image|edge)\s+@(\w+)/gm)];
  if (nodeIdMatches.length === 0) {
    fdCanvas.set_text(current.trimEnd() + '\n\n' + fdCode + '\n');
    vscode.postMessage({ type: 'textUpdate', text: fdCanvas.get_text() });
    renderDirty = true;
    return;
  }
  let result = current;
  let anyReplaced = false;
  for (const match of nodeIdMatches) {
    const nodeId = match[1];
    const blockRange = findNodeBlock(result, nodeId);
    if (blockRange) {
      const newBlock = extractNodeBlock(fdCode, nodeId);
      if (newBlock) {
        result = result.slice(0, blockRange.start) + newBlock + result.slice(blockRange.end);
        anyReplaced = true;
      }
    }
  }
  if (!anyReplaced) {
    result = result.trimEnd() + '\n\n' + fdCode + '\n';
  }
  fdCanvas.set_text(result);
  vscode.postMessage({ type: 'textUpdate', text: result });
  renderDirty = true;
}

// ─── Add Message ────────────────────────────────────────

function addChatMessage(role, content) {
  const messages = document.getElementById('ai-chat-messages');
  if (!messages) return null;
  const welcome = messages.querySelector('.ai-chat-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `ai-chat-msg ${role}`;

  if (role === 'user') {
    div.textContent = content;
  } else if (role === 'thinking') {
    div.textContent = '✦ Thinking…';
  } else {
    div.innerHTML = renderAssistantHtml(content);
    div.querySelectorAll('.fd-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fdCode = decodeURIComponent(btn.dataset.fd);
        smartApplyFdCode(fdCode);
        const actionDiv = btn.closest('.fd-block-action');
        if (actionDiv) actionDiv.innerHTML = '<span style="color:#34C759;font-size:10px;font-weight:600">✓ Applied</span>';
      });
    });
    div.querySelectorAll('.fd-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const actionDiv = btn.closest('.fd-block-action');
        if (actionDiv) actionDiv.innerHTML = '<span style="color:#86868B;font-size:10px;font-style:italic">Skipped</span>';
      });
    });
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

// ─── Send Message ───────────────────────────────────────

async function sendChatMessage() {
  const input = document.getElementById('ai-chat-input');
  const sendBtn = document.getElementById('ai-chat-send');
  if (!input || aiChatSending) return;

  const text = input.value.trim();
  if (!text) return;

  aiChatSending = true;
  if (sendBtn) sendBtn.disabled = true;
  input.value = '';
  input.style.height = 'auto';

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
  const thinkingDiv = addChatMessage('thinking', '');

  try {
    const docContent = fdCanvas ? fdCanvas.get_text() : '';
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

    if (thinkingDiv) thinkingDiv.remove();

    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream') && response.body) {
      // ─── SSE Streaming ─────────────────────────────
      const messages = document.getElementById('ai-chat-messages');
      const div = document.createElement('div');
      div.className = 'ai-chat-msg assistant';

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
              div.textContent = accumulated;
              messages.scrollTop = messages.scrollHeight;
            }
          } catch (_) {}
        }
      }

      // Finalize with full markdown + Apply/Skip buttons
      const finalContent = accumulated || 'No response received.';
      chatHistory.push({ role: 'assistant', content: finalContent });
      div.innerHTML = renderAssistantHtml(finalContent);

      div.querySelectorAll('.fd-apply-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const fdCode = decodeURIComponent(btn.dataset.fd);
          smartApplyFdCode(fdCode);
          const actionDiv = btn.closest('.fd-block-action');
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
      addChatMessage('assistant', assistantContent);
    }
  } catch (err) {
    if (thinkingDiv) thinkingDiv.remove();
    addChatMessage('assistant', `⚠️ Error: ${err.message}`);
  } finally {
    aiChatSending = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

// ─── Panel Toggle ───────────────────────────────────────

function toggleChatPanel() {
  const panel = document.getElementById('ai-chat-panel');
  if (!panel) return;
  const willOpen = panel.classList.contains('hidden');
  if (willOpen) {
    // Exclusive: close specs panel
    const specsPanel = document.getElementById('specs-panel');
    if (specsPanel && !specsPanel.classList.contains('hidden')) {
      specsPanel.classList.add('hidden');
    }
  }
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    document.getElementById('ai-chat-input')?.focus();
    updateChatContextBadge();
    updateChatChips();
  }
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
    updateChatChips();
  }
}

// ─── Setup ──────────────────────────────────────────────

function setupAiChat() {
  document.getElementById('ai-chat-btn')?.addEventListener('click', toggleChatPanel);
  document.getElementById('ai-chat-close')?.addEventListener('click', () => {
    document.getElementById('ai-chat-panel')?.classList.add('hidden');
  });
  document.getElementById('ai-chat-send')?.addEventListener('click', sendChatMessage);

  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    input.addEventListener('input', () => autoResize(input));

    // Update context badge on focus (selection may have changed)
    input.addEventListener('focus', () => {
      updateContextBadge();
      updateChatChips();
    });
  }

  const clearCtxBtn = document.getElementById('ai-chat-context-clear');
  if (clearCtxBtn) {
    clearCtxBtn.addEventListener('click', () => {
      // webview canvas selection clear
      try {
        if (typeof fdCanvas !== 'undefined' && fdCanvas.clear_selection) {
          fdCanvas.clear_selection();
        }
      } catch (_) {}
      updateContextBadge();
      updateChatChips();
    });
  }

  // Clear chat button located in the panel/tabs
  const clearChatBtn = document.getElementById('ai-chat-clear');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      clearChatHistory();
    });
  }

  // Update chips/badge on selection changes
  document.addEventListener('fd-selection-changed', () => {
    const panel = document.getElementById('ai-chat-panel');
    if (panel && !panel.classList.contains('hidden')) {
      updateContextBadge();
      updateChatChips();
    }
  });

  updateChatChips();
}

export { setupAiChat };
