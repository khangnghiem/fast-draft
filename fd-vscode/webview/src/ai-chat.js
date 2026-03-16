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

function updateChatContextBadge() {
  const badge = document.getElementById('ai-chat-context-badge');
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
  let displayMsg = text;
  if (selIds.length > 0) {
    displayMsg = `[📌 ${selIds.map(id => '@' + id).join(', ')}] ${text}`;
  }

  chatHistory.push({ role: 'user', content: text });
  addChatMessage('user', displayMsg);
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
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const assistantContent = data.result || 'No response received.';
    if (thinkingDiv) thinkingDiv.remove();
    chatHistory.push({ role: 'assistant', content: assistantContent });
    addChatMessage('assistant', assistantContent);
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

function clearChat() {
  chatHistory.length = 0;
  const messages = document.getElementById('ai-chat-messages');
  if (messages) {
    messages.innerHTML = '<div class="ai-chat-welcome"><p>Ask me about your design. I can modify nodes, suggest improvements, or answer questions.</p><p class="ai-chat-hint">Try: "Make the colors warmer" or "Add a header section"</p></div>';
  }
}

// ─── Setup ──────────────────────────────────────────────

function setupAiChat() {
  document.getElementById('ai-chat-btn')?.addEventListener('click', toggleChatPanel);
  document.getElementById('ai-chat-close')?.addEventListener('click', () => {
    document.getElementById('ai-chat-panel')?.classList.add('hidden');
  });
  document.getElementById('ai-chat-clear')?.addEventListener('click', clearChat);
  document.getElementById('ai-chat-send')?.addEventListener('click', sendChatMessage);

  const input = document.getElementById('ai-chat-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 80) + 'px';
    });
    input.addEventListener('focus', () => {
      updateChatContextBadge();
      updateChatChips();
    });
  }

  // Update chips/badge on selection changes
  document.addEventListener('fd-selection-changed', () => {
    const panel = document.getElementById('ai-chat-panel');
    if (panel && !panel.classList.contains('hidden')) {
      updateChatContextBadge();
      updateChatChips();
    }
  });

  updateChatChips();
}
