/**
 * AI Chat — Multi-Turn Agent panel for Fast Draft playground.
 *
 * Provides a conversational interface where users can discuss their
 * design and request modifications. Supports:
 *   - Multi-turn conversation with context
 *   - Automatic document context injection
 *   - Per-block accept/reject for FD code changes
 *   - Markdown rendering in responses
 */

// ─── State ──────────────────────────────────────────────

const chatHistory = [];
let isSending = false;
const AI_ENDPOINT = '/api/ai';

// ─── DOM References ─────────────────────────────────────

function getChatPanel() { return document.getElementById('ai-chat-panel'); }
function getChatMessages() { return document.getElementById('ai-chat-messages'); }
function getChatInput() { return document.getElementById('ai-chat-input'); }
function getChatSend() { return document.getElementById('ai-chat-send'); }
function getChatBtn() { return document.getElementById('ai-chat-btn'); }
function getChatClose() { return document.getElementById('ai-chat-close'); }

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
      // Sync specsPanelOpen state if it exists on window
      if (typeof window._specsPanelOpen !== 'undefined') window._specsPanelOpen = false;
    }
  }
  panel.classList.toggle('hidden');
  if (!panel.classList.contains('hidden')) {
    const input = getChatInput();
    if (input) input.focus();
  }
}

export function closeChatPanel() {
  const panel = getChatPanel();
  if (panel) panel.classList.add('hidden');
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
 */
function renderAssistantMessage(content, getEditorContent, setEditorContent) {
  // Parse FD code blocks and add accept/reject buttons
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
      // Simple markdown: **bold**, `code`, newlines
      let md = escapeHtml(part);
      md = md.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/`([^`]+)`/g, '<code>$1</code>');
      md = md.replace(/\n/g, '<br>');
      html += md;
    }
  }

  return html;
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

    // Wire up accept/reject buttons
    div.querySelectorAll('.fd-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fdCode = decodeURIComponent(btn.dataset.fd);
        const actionDiv = btn.closest('.fd-block-action');
        if (setEditorContent && typeof setEditorContent === 'function') {
          // Append FD code to current document
          const current = getEditorContent ? getEditorContent() : '';
          setEditorContent(current.trimEnd() + '\n\n' + fdCode + '\n');
        }
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

  // Add user message
  chatHistory.push({ role: 'user', content: text });
  addMessage('user', text);

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
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const assistantContent = data.result || 'No response received.';

    // Remove thinking indicator
    if (thinkingDiv) thinkingDiv.remove();

    // Add assistant message
    chatHistory.push({ role: 'assistant', content: assistantContent });
    addMessage('assistant', assistantContent, getEditorContent, setEditorContent);
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
 */
export function initAiChat(getEditorContent, setEditorContent) {
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
  }
}
