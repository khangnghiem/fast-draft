// ─── Unified Context Menu ─────────────────────────────────────────────────
// Data-driven, keyboard-navigable, single-dismiss context menu.
// Used by both canvas right-click and layer right-click.
//
// Item types:
//   { type: 'action', icon, label, shortcut, action, disabled, danger, data }
//   { type: 'separator' }
//   { type: 'header', label }
//   { type: 'custom', render: (container) => HTMLElement }
//
// Usage:
//   const menu = new ContextMenu();
//   menu.open({ items, x, y, onAction });
//   menu.close();
//   menu.isOpen;

class ContextMenu {
  /** @type {HTMLDivElement|null} */
  #el = null;
  /** @type {AbortController|null} */
  #ac = null;
  /** @type {number} */
  #activeIndex = -1;
  /** @type {Function|null} */
  #onAction = null;

  /** Whether a menu is currently open. */
  get isOpen() { return this.#el !== null; }

  /**
   * Open a context menu. Closes any existing menu first (singleton).
   * @param {{ items: Array, x: number, y: number, onAction: Function }} opts
   */
  open({ items, x, y, onAction }) {
    this.close(); // Singleton: always close previous first

    this.#onAction = onAction;
    this.#ac = new AbortController();
    const signal = this.#ac.signal;

    // Build DOM
    const el = document.createElement('div');
    el.className = 'ctx-menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'Context menu');
    this.#el = el;

    this.#renderItems(el, items);

    // Append to body (needed for offsetWidth/Height measurement)
    document.body.appendChild(el);

    // Position with viewport clamping
    this.#positionMenu(x, y);

    // Animate in
    requestAnimationFrame(() => el.classList.add('ctx-menu-visible'));

    // ── Dismiss listeners (all on AbortController signal) ──
    // Capture phase — bypasses any stopPropagation in the DOM tree
    document.addEventListener('pointerdown', this.#onPointerDown, { signal, capture: true });
    document.addEventListener('scroll', () => this.close(), { signal, capture: true, passive: true });
    window.addEventListener('blur', () => this.close(), { signal });
    window.addEventListener('resize', () => this.close(), { signal });
    // Keyboard: capture phase to intercept before canvas shortcuts
    document.addEventListener('keydown', this.#onKeyDown, { signal, capture: true });
  }

  /** Close the menu and clean up all listeners. */
  close() {
    if (!this.#el) return;
    this.#ac?.abort();
    this.#el.remove();
    this.#el = null;
    this.#ac = null;
    this.#activeIndex = -1;
    this.#onAction = null;
  }

  // ── Private: Render ──────────────────────────────────────────────────

  /** Build menu item DOM from item descriptors. */
  #renderItems(container, items) {
    for (const item of items) {
      if (item.type === 'separator') {
        const sep = document.createElement('div');
        sep.className = 'ctx-menu-sep';
        sep.setAttribute('role', 'separator');
        container.appendChild(sep);
        continue;
      }

      if (item.type === 'header') {
        const hdr = document.createElement('div');
        hdr.className = 'ctx-menu-header';
        hdr.textContent = item.label;
        container.appendChild(hdr);
        continue;
      }

      if (item.type === 'custom' && typeof item.render === 'function') {
        const wrapper = document.createElement('div');
        wrapper.className = 'ctx-menu-custom';
        item.render(wrapper);
        container.appendChild(wrapper);
        continue;
      }

      // Default: action item
      const btn = document.createElement('div');
      btn.className = 'ctx-menu-item';
      if (item.disabled) {
        btn.classList.add('ctx-menu-disabled');
        btn.setAttribute('aria-disabled', 'true');
      }
      if (item.danger) btn.classList.add('ctx-menu-danger');
      btn.setAttribute('role', 'menuitem');
      btn.setAttribute('tabindex', '-1');
      if (item.action) btn.setAttribute('data-action', item.action);
      if (item.data) {
        for (const [k, v] of Object.entries(item.data)) {
          btn.setAttribute(`data-${k}`, v);
        }
      }

      // Icon
      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'ctx-menu-icon';
        iconSpan.textContent = item.icon;
        btn.appendChild(iconSpan);
      }

      // Label
      const labelSpan = document.createElement('span');
      labelSpan.className = 'ctx-menu-label';
      labelSpan.textContent = item.label;
      btn.appendChild(labelSpan);

      // Shortcut
      if (item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'ctx-menu-shortcut';
        shortcutSpan.textContent = item.shortcut;
        btn.appendChild(shortcutSpan);
      }

      // Click handler
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (item.disabled) return;
        this.#fireAction(item.action, btn);
      });

      container.appendChild(btn);
    }
  }

  // ── Private: Positioning ─────────────────────────────────────────────

  /** Position the menu at (x, y), clamped to viewport. */
  #positionMenu(x, y) {
    const el = this.#el;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mw = el.offsetWidth;
    const mh = el.offsetHeight;
    const pad = 4;
    if (x + mw > vw - pad) x = vw - mw - pad;
    if (y + mh > vh - pad) y = vh - mh - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  // ── Private: Event Handlers ──────────────────────────────────────────

  /** Capture-phase pointerdown: close if click is outside menu. */
  #onPointerDown = (e) => {
    if (this.#el && !this.#el.contains(e.target)) {
      this.close();
    }
  };

  /** Capture-phase keydown: Escape closes, Arrow/Enter navigate. */
  #onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }

    // Skip keyboard nav if focus is inside a custom element (textarea/input)
    if (this.#el?.querySelector(':focus-within textarea, :focus-within input')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      this.#moveActive(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      this.#moveActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this.#activateItem();
    }
  };

  // ── Private: Keyboard Navigation ─────────────────────────────────────

  /** Move the active highlight by delta (+1 = down, -1 = up). */
  #moveActive(delta) {
    if (!this.#el) return;
    const items = this.#el.querySelectorAll('[role="menuitem"]:not(.ctx-menu-disabled)');
    if (!items.length) return;

    // Calculate new index with wrapping
    if (this.#activeIndex < 0) {
      this.#activeIndex = delta > 0 ? 0 : items.length - 1;
    } else {
      this.#activeIndex = (this.#activeIndex + delta + items.length) % items.length;
    }

    // Update visual state
    this.#el.querySelectorAll('[role="menuitem"]').forEach(el => el.classList.remove('ctx-menu-active'));
    items[this.#activeIndex].classList.add('ctx-menu-active');
    items[this.#activeIndex].scrollIntoView({ block: 'nearest' });
  }

  /** Activate the currently highlighted item. */
  #activateItem() {
    if (!this.#el || this.#activeIndex < 0) return;
    const items = this.#el.querySelectorAll('[role="menuitem"]:not(.ctx-menu-disabled)');
    if (this.#activeIndex >= items.length) return;
    const btn = items[this.#activeIndex];
    this.#fireAction(btn.getAttribute('data-action'), btn);
  }

  /** Fire the onAction callback and close. */
  #fireAction(action, el) {
    const cb = this.#onAction;
    this.close();
    if (cb && action) cb(action, el);
  }
}
