const FENCE_LANGS = new Set(['', 'fd', 'fastdraft', 'text', 'plain']);
const FD_BLOCK_START_RE = /(?:^|\n)\s*(?:rect|frame|group|ellipse|text|edge|path|image|style)\s+/i;

function stripLeadingProse(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const start = raw.search(FD_BLOCK_START_RE);
  return start >= 0 ? raw.slice(start).trim() : raw;
}

export function stripMarkdownFences(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';

  const fenceRegex = /```([a-zA-Z0-9_-]*)\s*([\s\S]*?)```/g;
  let firstFence = null;
  for (const match of trimmed.matchAll(fenceRegex)) {
    const lang = (match[1] || '').toLowerCase();
    const body = (match[2] || '').trim();
    if (firstFence == null) firstFence = body;
    if (FENCE_LANGS.has(lang)) {
      return stripLeadingProse(body);
    }
  }

  if (firstFence != null) {
    return stripLeadingProse(firstFence);
  }
  return stripLeadingProse(trimmed);
}

export class AiTouchSession {
  constructor({
    getCanvas,
    getEditorText,
    setEditorText,
    renderCanvas,
    fitToContent,
    measureAllTextNodes,
    refreshLayersPanel,
    updatePropertiesPanel,
    showToast,
    updateRateLimitUI,
    buildPrompt,
    endpoint = '/api/ai',
    fetchImpl = globalThis.fetch?.bind(globalThis),
  }) {
    this.getCanvas = getCanvas;
    this.getEditorText = getEditorText;
    this.setEditorText = setEditorText;
    this.renderCanvas = renderCanvas || (() => {});
    this.fitToContent = fitToContent || null;
    this.measureAllTextNodes = measureAllTextNodes || null;
    this.refreshLayersPanel = refreshLayersPanel || (() => {});
    this.updatePropertiesPanel = updatePropertiesPanel || (() => {});
    this.showToast = showToast || (() => {});
    this.updateRateLimitUI = updateRateLimitUI || (() => {});
    this.buildPrompt = buildPrompt;
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.state = 'idle';
    this.active = null;
    this.abortController = null;
    this.toolbarAbortController = null;
    this.toolbarBodyFallbackLogged = false;
  }

  isBusy() {
    return this.state === 'thinking' || this.state === 'previewing';
  }

  async start({ userFocus = '', modelHint = 'auto' } = {}) {
    if (this.state === 'previewing') this.reject();
    if (this.abortController) this.abortController.abort();

    const canvas = this.getCanvas?.();
    if (!canvas) {
      this.showToast('Canvas not ready');
      return false;
    }

    const baselineText = this.getEditorText() || (canvas.get_text ? canvas.get_text() : '');
    this.alignCanvasToBaseline(canvas, baselineText);
    this.measureCanvasTextNodes(canvas);
    this.fitToCanvas(canvas);
    const selectedIds = this.getSelectedIds(canvas);
    const prompt = this.buildPrompt
      ? this.buildPrompt(baselineText, selectedIds)
      : `Refine this FD document and return only FD code:\n\n${baselineText}`;
    const begin = this.parseJson(canvas.ai_begin_preview?.(), {});
    if (!begin?.baselineId) {
      this.showToast('AI Touch preview unavailable');
      return false;
    }

    this.state = 'thinking';
    this.active = {
      baselineText,
      baselineId: begin.baselineId,
      selectedIds,
      candidateText: null,
      source: 'toolbar',
    };
    this.abortController = new AbortController();

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          mode: 'refine',
          model_hint: modelHint,
          user_focus: userFocus,
          selection_ids: selectedIds,
        }),
        signal: this.abortController.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        this.showToast(`Rate limit reached — ${data.limit || '?'} / day free. Try again tomorrow.`);
        this.cancel();
        return false;
      }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      this.updateRateLimitUI(data.remaining, data.limit);
      const candidateText = stripMarkdownFences(data.result || data.refinedText || data.text || '');
      return this.previewCandidate(candidateText, { source: 'toolbar' });
    } catch (error) {
      if (error?.name !== 'AbortError') this.showToast('AI unavailable — check /api/ai endpoint');
      this.cancel();
      return false;
    } finally {
      this.abortController = null;
    }
  }

  previewCandidate(candidateText, { source = 'chat', actionDiv = null } = {}) {
    const canvas = this.getCanvas?.();
    if (!canvas) return false;
    const candidate = stripMarkdownFences(candidateText);
    if (!candidate) {
      this.showToast('AI returned empty output — try again');
      return false;
    }

    if (!this.active || this.state === 'idle') {
      if (this.abortController) this.abortController.abort();
      const baselineText = this.getEditorText() || (canvas.get_text ? canvas.get_text() : '');
      this.alignCanvasToBaseline(canvas, baselineText);
      const begin = this.parseJson(canvas.ai_begin_preview?.(), {});
      if (!begin?.baselineId) {
        this.showToast('AI Touch preview unavailable');
        return false;
      }
      this.active = {
        baselineText,
        baselineId: begin.baselineId,
        selectedIds: this.getSelectedIds(canvas),
        candidateText: null,
        source,
        actionDiv,
      };
    }

    const result = this.parseJson(canvas.ai_apply_preview(this.active.baselineId, candidate), { ok: false });
    if (!result.ok) {
      if (result.noop) {
        this.showToast('AI returned no changes — try a different prompt');
      } else {
        this.showToast(`AI Touch: invalid FD${result.error ? ` — ${result.error}` : ''}`);
      }
      canvas.ai_discard_preview?.(this.active.baselineId);
      this.clearToolbar();
      this.markAction('rejected');
      this.state = 'idle';
      this.active = null;
      this.renderCanvas();
      this.refreshLayersPanel();
      this.updatePropertiesPanel();
      return false;
    }
    this.active.candidateText = candidate;
    this.active.source = source;
    this.active.actionDiv = actionDiv;
    this.state = 'previewing';
    this.restoreSelection(canvas, this.active.selectedIds);
    this.renderCanvas();
    this.measureCanvasTextNodes(canvas);
    this.fitToCanvas(canvas);
    this.refreshLayersPanel();
    this.updatePropertiesPanel();
    this.showToolbar();
    this.setPreviewVisualState(true);
    if (actionDiv) actionDiv.dataset.previewing = 'true';
    this.showToast('✦ AI Touch preview ready — accept or reject');
    return true;
  }

  previewFdCode({ fdCode, mode = 'replace', actionDiv = null, candidateText = null, mergeStrategy = null } = {}) {
    if (this.abortController) this.abortController.abort();
    const current = this.getEditorText();
    let candidate;
    if (typeof candidateText === 'string') {
      candidate = candidateText;
    } else if (mode === 'replace') {
      candidate = stripMarkdownFences(fdCode);
    } else if (typeof mergeStrategy === 'function') {
      candidate = mergeStrategy(current, fdCode);
    } else {
      const clean = stripMarkdownFences(fdCode);
      candidate = !current.trim() ? clean : !clean.trim() ? current : `${current.trimEnd()}\n\n${clean.trimStart()}`;
    }
    return this.previewCandidate(candidate, { source: 'chat', actionDiv });
  }

  accept() {
    if (!this.active || this.state !== 'previewing') return false;
    if (this.getEditorText() !== this.active.baselineText) {
      this.showToast('AI Touch baseline changed — reject and retry');
      return false;
    }
    const canvas = this.getCanvas?.();
    if (canvas?.get_text?.() !== this.active.candidateText) {
      this.showToast('AI Touch preview changed — reject and retry');
      return false;
    }
    const result = this.parseJson(canvas?.ai_commit_preview(this.active.baselineId, 'AI Touch'), { ok: false });
    if (!result.ok) {
      this.showToast(`AI Touch accept failed${result.error ? ` — ${result.error}` : ''}`);
      return false;
    }
    this.restoreSelection(canvas, this.active.selectedIds);
    this.setEditorText(this.active.candidateText);
    this.clearToolbar();
    this.markAction('accepted');
    this.state = 'idle';
    this.active = null;
    this.renderCanvas();
    this.measureCanvasTextNodes(canvas);
    this.fitToCanvas(canvas);
    this.refreshLayersPanel();
    this.updatePropertiesPanel();
    document.dispatchEvent(new CustomEvent('fd-ai-applied'));
    this.showToast('✓ AI Touch applied — use Undo to revert');
    return true;
  }

  reject() {
    if (!this.active) return false;
    const canvas = this.getCanvas?.();
    const discarded = Boolean(canvas?.ai_discard_preview?.(this.active.baselineId));
    if (!discarded) {
      this.markAction('rejected');
      this.clearToolbar();
      this.state = 'idle';
      this.active = null;
      this.renderCanvas();
      this.refreshLayersPanel();
      this.updatePropertiesPanel();
      this.showToast('AI Touch: forced reset — please reload if canvas looks wrong');
      return false;
    }
    this.clearToolbar();
    this.markAction('rejected');
    this.state = 'idle';
    this.active = null;
    this.renderCanvas();
    this.measureCanvasTextNodes(canvas);
    this.fitToCanvas(canvas);
    this.refreshLayersPanel();
    this.updatePropertiesPanel();
    this.showToast('✗ AI Touch rejected');
    return true;
  }

  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.active && this.state === 'previewing') {
      this.reject();
      return true;
    }
    if (this.active) {
      const canvas = this.getCanvas?.();
      canvas?.ai_discard_preview?.(this.active.baselineId);
      this.markAction('rejected');
      this.clearToolbar();
      this.state = 'idle';
      this.active = null;
      this.renderCanvas();
      this.refreshLayersPanel();
      this.updatePropertiesPanel();
      return true;
    }
    this.clearToolbar();
    this.state = 'idle';
    return true;
  }

  getSelectedIds(canvas) {
    try {
      const ids = JSON.parse(canvas.get_selected_ids?.() || '[]');
      return Array.isArray(ids) ? ids : [];
    } catch (_) {
      const id = canvas.get_selected_id?.();
      return id ? [id] : [];
    }
  }

  parseJson(value, fallback) {
    if (!value) return fallback;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return fallback; }
  }

  alignCanvasToBaseline(canvas, baselineText) {
    if (!canvas?.get_text || !canvas?.set_text) return;
    if (canvas.get_text() !== baselineText) canvas.set_text(baselineText);
  }

  restoreSelection(canvas, selectedIds) {
    if (!canvas?.select_multiple_by_ids || !Array.isArray(selectedIds)) return;
    canvas.select_multiple_by_ids(JSON.stringify(selectedIds));
  }

  setPreviewVisualState(active) {
    const root = document.getElementById('fd-canvas')
      || document.getElementById('canvas-content')
      || document.getElementById('canvas-wrapper');
    if (!root) return;
    if (active) root.setAttribute('data-ai-preview', 'active');
    else root.removeAttribute('data-ai-preview');
  }

  fitToCanvas(canvas) {
    if (typeof this.fitToContent === 'function') {
      try { this.fitToContent(canvas); } catch (_) {}
    }
  }

  measureCanvasTextNodes(canvas) {
    if (typeof this.measureAllTextNodes === 'function') {
      try { this.measureAllTextNodes(canvas, document.getElementById('fd-canvas')); } catch (_) {}
    }
  }

  isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('input, textarea')) return true;
    const editable = target.closest('[contenteditable]');
    if (!editable) return false;
    return editable.getAttribute('contenteditable') !== 'false';
  }

  getToolbarHost() {
    const preferred = document.querySelector('.canvas-area');
    if (preferred) return preferred;

    const pane = document.getElementById('canvas-content')
      || document.getElementById('canvas-wrapper')
      || document.querySelector('.playground-canvas');
    if (pane) return pane;

    if (!this.toolbarBodyFallbackLogged) {
      console.warn('[AI Touch] .canvas-area not found; falling back toolbar host to <body>.');
      this.toolbarBodyFallbackLogged = true;
    }
    return document.body;
  }

  showToolbar() {
    this.clearToolbar();
    const controller = new AbortController();
    this.toolbarAbortController = controller;

    const toolbar = document.createElement('div');
    toolbar.id = 'ai-diff-toolbar';
    toolbar.className = 'ai-diff-toolbar';
    this.getToolbarHost().appendChild(toolbar);

    toolbar.innerHTML = `
      <span class="ai-diff-label">✦ AI Touch preview</span>
      <button class="ai-diff-accept" type="button">Accept</button>
      <button class="ai-diff-reject" type="button">Reject</button>
    `;
    toolbar.querySelector('.ai-diff-accept')?.addEventListener('click', () => this.accept(), { signal: controller.signal });
    toolbar.querySelector('.ai-diff-reject')?.addEventListener('click', () => this.reject(), { signal: controller.signal });

    document.addEventListener('keydown', (event) => {
      if (this.state !== 'previewing') return;
      if (this.isEditableTarget(event.target)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        this.accept();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.reject();
      }
    }, { signal: controller.signal });

    toolbar.classList.add('visible');
  }

  clearToolbar() {
    if (this.toolbarAbortController) {
      this.toolbarAbortController.abort();
      this.toolbarAbortController = null;
    }
    document.getElementById('ai-diff-toolbar')?.remove();
    this.setPreviewVisualState(false);
  }

  markAction(status) {
    if (!this.active?.actionDiv) return;
    this.active.actionDiv.dataset.previewing = 'false';
    this.active.actionDiv.dataset.aiTouchStatus = status;
  }
}
