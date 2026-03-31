// ── Layers Panel ──────────────────────────────────────────────────────────
// Handles layer tree rendering, hierarchical drag-and-drop, and context menus.

export function initLayersPanel(api) {
  /** ─── Layers Panel ────────────────────────────────────────────────────── */
  const LAYER_ICONS = {
    group: '◻', frame: '▣', rect: '▢', ellipse: '○',
    path: '〜', text: 'T', style: '◆', edge: '⟶', note: '◇', spec: '◇'
  };
  
  function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  
  /** Parse FD source into a hierarchical layer tree. */
  function parseLayerTree(source) {
    const lines = source.split('\n');
    const root = [];
    const stack = [];
    let braceDepth = 0;
  
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
  
      const openBraces = (trimmed.match(/\{/g) || []).length;
      const closeBraces = (trimmed.match(/\}/g) || []).length;
  
      // Style definition
      const styleMatch = trimmed.match(/^style\s+(\w+)\s*\{/);
      if (styleMatch) {
        const node = { id: styleMatch[1], kind: 'style', text: '', children: [] };
        if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
        else root.push(node);
        braceDepth += openBraces - closeBraces;
        stack.push({ node, depth: braceDepth });
        continue;
      }
  
      // Edge — matches both header form (edge @name @from -> @to) and body form (edge @name {)
      const edgeMatch = trimmed.match(/^edge\s+@(\w+)\s+@(\w+)\s*->\s*@(\w+)/) ||
                        trimmed.match(/^edge\s+@(\w+)\s*\{/);
      if (edgeMatch) {
        const node = { id: edgeMatch[1], kind: 'edge', text: '', children: [] };
        if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
        else root.push(node);
        if (trimmed.includes('{')) { braceDepth += 1; stack.push({ node, depth: braceDepth }); }
        continue;
      }
  
      // Typed node
      const nodeMatch = trimmed.match(/^(group|frame|rect|ellipse|path|text)\s+@(\w+)(?:\s+"([^"]*)")?\s*\{?/);
      if (nodeMatch) {
        const node = { id: nodeMatch[2], kind: nodeMatch[1], text: nodeMatch[3] || '', children: [] };
        if (stack.length > 0) stack[stack.length - 1].node.children.push(node);
        else root.push(node);
        if (trimmed.endsWith('{')) { braceDepth += 1; stack.push({ node, depth: braceDepth }); }
        continue;
      }
  
      // Closing brace
      if (trimmed === '}') {
        braceDepth -= 1;
        while (stack.length > 0 && stack[stack.length - 1].depth > braceDepth) stack.pop();
        continue;
      }
  
      braceDepth += openBraces - closeBraces;
    }
    return root;
  }
  
  /** Render a layer tree node as HTML. */
  function renderLayerNode(node, selectedIds, depth = 0) {
    const icon = LAYER_ICONS[node.kind] || '•';
    const isSelected = selectedIds.has(node.id);
    const hasChildren = node.children.length > 0;
  
    let indent = '';
    for (let i = 0; i < depth; i++) indent += '<span class="layer-indent-guide"></span>';
  
    const chevronClass = hasChildren ? 'layer-chevron expanded' : 'layer-chevron empty';
    const chevron = `<span class="${chevronClass}" data-toggle-id="${escHtml(node.id)}">▶</span>`;
  
    const isContainer = ['rect','ellipse','frame','group'].includes(node.kind);
    let html = `<div class="layer-item${isSelected ? ' selected' : ''}" data-node-id="${escHtml(node.id)}" data-node-kind="${escHtml(node.kind)}" draggable="true">`;
    html += `<span class="layer-indent">${indent}</span>`;
    html += chevron;
    html += `<span class="layer-icon">${icon}</span>`;
    html += `<span class="layer-name">${escHtml(node.id)}</span>`;
    html += `<span class="layer-kind">${escHtml(node.kind)}</span>`;
    html += `<button class="layer-action-btn layer-delete-btn" aria-label="Delete" title="Delete Node"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button>`;
    html += '</div>';
  
    if (hasChildren) {
      html += `<div class="layer-children" data-parent-id="${escHtml(node.id)}">`;
      for (const child of node.children) html += renderLayerNode(child, selectedIds, depth + 1);
      html += '</div>';
    }
    return html;
  }
  
  let lastLayerText = '';
  let lastLayerSelectedId = '';
  
  /** Last clicked layer item ID — for ⇧+click range select */
  let lastClickedLayerId = '';
  
  /** Flatten a layer tree into a visible-order array of IDs (respects collapsed state). */
  function flattenLayerTree(nodes, panel) {
    const result = [];
    for (const node of nodes) {
      result.push(node.id);
      if (node.children.length > 0) {
        const childrenEl = panel?.querySelector(`.layer-children[data-parent-id="${node.id}"]`);
        const isCollapsed = childrenEl?.classList.contains('collapsed');
        if (!isCollapsed) {
          result.push(...flattenLayerTree(node.children, panel));
        }
      }
    }
    return result;
  }
  
  /** Close any open layer context menu. */
  function closeLayerCtxMenu() {
    api.ctxMenu.close();
  }
  
  /** Searchable "Move Into" picker — replaces static container list with a filterable search. */
  function showSearchableParentPicker(nodeId, posX, posY) {
    if (!api.getFdCanvas()?.get_container_ids) return;
  
    let containers;
    try { containers = JSON.parse(api.getFdCanvas().get_container_ids()); } catch (_) { return; }
    const validTargets = containers.filter(c => c.id !== nodeId);
    if (validTargets.length === 0) { api.showToast('No valid containers'); return; }
  
    // Remove any existing picker
    document.getElementById('parent-picker')?.remove();
  
    const picker = document.createElement('div');
    picker.id = 'parent-picker';
    picker.style.cssText = `position:fixed;left:${posX}px;top:${posY}px;z-index:310;` +
      'min-width:220px;max-width:280px;max-height:320px;display:flex;flex-direction:column;' +
      'background:var(--fd-surface-solid,#1C1C1E);border:1px solid var(--fd-border,#333);' +
      'border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.5);overflow:hidden;' +
      'font-family:var(--mono);font-size:12px;';
  
    // Header
    const header = document.createElement('div');
    header.style.cssText = 'padding:8px 10px 4px;color:var(--fd-text-dim,#888);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
    header.textContent = `Move @${nodeId} into`;
    picker.appendChild(header);
  
    // Search input
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search containers…';
    input.style.cssText = 'margin:0 8px 4px;padding:6px 8px;border:1px solid var(--fd-border,#444);' +
      'border-radius:6px;background:var(--fd-bg,#0A0A0A);color:var(--fd-text,#E5E5EA);' +
      'font-size:12px;font-family:var(--mono);outline:none;';
    picker.appendChild(input);
  
    // Results list
    const list = document.createElement('div');
    list.style.cssText = 'overflow-y:auto;max-height:240px;padding:4px 0;';
    picker.appendChild(list);
  
    const LAYER_ICONS = { rect: '▢', ellipse: '○', frame: '⊞', group: '⊟', text: 'T', pen: '✐', image: '🖼' };
  
    function renderList(filter) {
      list.innerHTML = '';
      const q = (filter || '').toLowerCase();
      const matches = validTargets.filter(c => c.id.toLowerCase().includes(q));
      if (matches.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:12px 10px;color:var(--fd-text-dim,#666);text-align:center;';
        empty.textContent = 'No matches';
        list.appendChild(empty);
        return;
      }
      for (const t of matches.slice(0, 50)) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 10px;cursor:pointer;' +
          'color:var(--fd-text,#E5E5EA);transition:background .1s;';
        row.addEventListener('mouseenter', () => { row.style.background = 'var(--fd-hover,rgba(255,255,255,0.06))'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
  
        const icon = document.createElement('span');
        icon.textContent = LAYER_ICONS[t.kind] || '•';
        icon.style.cssText = 'width:16px;text-align:center;flex-shrink:0;';
        row.appendChild(icon);
  
        const name = document.createElement('span');
        name.textContent = `@${t.id}`;
        name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        row.appendChild(name);
  
        // Two actions: Move (nest) and Center
        const moveBtn = document.createElement('button');
        moveBtn.textContent = '📦';
        moveBtn.title = 'Nest (preserve position)';
        moveBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
        moveBtn.addEventListener('mouseenter', () => { moveBtn.style.background = 'var(--fd-accent,#007AFF)'; });
        moveBtn.addEventListener('mouseleave', () => { moveBtn.style.background = ''; });
        moveBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, false); });
        row.appendChild(moveBtn);
  
        const centerBtn = document.createElement('button');
        centerBtn.textContent = '⊙';
        centerBtn.title = 'Center in container';
        centerBtn.style.cssText = 'background:none;border:none;cursor:pointer;padding:2px 4px;font-size:12px;border-radius:4px;';
        centerBtn.addEventListener('mouseenter', () => { centerBtn.style.background = 'var(--fd-accent,#007AFF)'; });
        centerBtn.addEventListener('mouseleave', () => { centerBtn.style.background = ''; });
        centerBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doReparent(t.id, true); });
        row.appendChild(centerBtn);
  
        // Click on row = nest (default)
        row.addEventListener('click', () => doReparent(t.id, false));
        list.appendChild(row);
      }
      if (matches.length > 50) {
        const more = document.createElement('div');
        more.style.cssText = 'padding:6px 10px;color:var(--fd-text-dim,#666);text-align:center;font-size:10px;';
        more.textContent = `…${matches.length - 50} more (refine search)`;
        list.appendChild(more);
      }
    }
  
    function doReparent(targetId, center) {
      const textBefore = api.getFdCanvas().get_text();
      let changed = false;
      if (center && api.getFdCanvas().reparent_into_centered) {
        changed = api.getFdCanvas().reparent_into_centered(nodeId, targetId);
      } else {
        changed = api.getFdCanvas().reparent_into(nodeId, targetId);
      }
      if (changed) {
        const textAfter = api.getFdCanvas().get_text();
        if (textBefore !== textAfter) api.getFdCanvas().push_undo_snapshot(textBefore, textAfter);
        api.renderCanvas();
        api.syncCanvasToEditor();
        api.updatePropertiesPanel();
        refreshLayersPanel();
        api.showToast(`Moved @${nodeId} → @${targetId}`);
      }
      closePicker();
    }
  
    function closePicker() {
      picker.remove();
      document.removeEventListener('pointerdown', outsideClickHandler, true);
      document.removeEventListener('keydown', escHandler, true);
    }
  
    function outsideClickHandler(ev) {
      if (!picker.contains(ev.target)) closePicker();
    }
    function escHandler(ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); closePicker(); }
    }
  
    input.addEventListener('input', () => renderList(input.value));
    renderList('');
  
    document.body.appendChild(picker);
  
    // Clamp to viewport
    requestAnimationFrame(() => {
      const r = picker.getBoundingClientRect();
      if (r.right > window.innerWidth) picker.style.left = Math.max(4, window.innerWidth - r.width - 4) + 'px';
      if (r.bottom > window.innerHeight) picker.style.top = Math.max(4, window.innerHeight - r.height - 4) + 'px';
    });
  
    // Focus input after a tick so it doesn't immediately close
    setTimeout(() => {
      input.focus();
      document.addEventListener('pointerdown', outsideClickHandler, true);
      document.addEventListener('keydown', escHandler, true);
    }, 50);
  }
  
  /** Clear all drag indicators from layer items. */
  function clearLayerDragIndicators(panel) {
    panel.querySelectorAll('.layer-item').forEach(el => {
      el.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
    });
    panel.querySelectorAll('.layers-body').forEach(el => {
      el.classList.remove('drag-over-root');
    });
  }
  
  /** Determine the drop zone based on cursor Y position within the element.
   *  Containers (rect/ellipse/frame/group) get a wider nest zone (70%, 15% edges)
   *  so reparent drops are easier to trigger. Non-containers use 50% (25% edges). */
  function getDropZone(e, el) {
    const rect = el.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    const kind = el.getAttribute('data-node-kind');
    const isContainer = ['rect','ellipse','frame','group'].includes(kind);
    const edgePct = isContainer ? 0.15 : 0.25;
    if (y < h * edgePct) return 'above';
    if (y > h * (1 - edgePct)) return 'below';
    return 'nest';
  }
  
  /** Collect a flat ordered list of {id, index-within-parent} from the DOM. */
  function getSiblingIndex(panel, nodeId) {
    const item = panel.querySelector(`.layer-item[data-node-id="${nodeId}"]`);
    if (!item) return 0;
    const parent = item.parentElement;
    if (!parent) return 0;
    const siblings = [...parent.querySelectorAll(':scope > .layer-item')];
    return siblings.indexOf(item);
  }
  
  /** Wire drag-and-drop handlers on all layer items (#1, #2, #4, #5). */
  function wireLayerDragDrop(panel) {
    if (!api.getFdCanvas()) return;
    let draggedId = null;
  
    panel.querySelectorAll('.layer-item').forEach(item => {
      // ── dragstart ──
      item.addEventListener('dragstart', (e) => {
        draggedId = item.getAttribute('data-node-id');
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
      });
  
      // ── dragenter ── (Crucial for Safari/macOS to allow drop)
      item.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation(); // prevent canvasWrapper from overriding dropEffect
        e.dataTransfer.dropEffect = 'move';
      });

      // ── dragover ── (determines drop zone indicator)
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation(); // prevent canvasWrapper from overriding dropEffect
        e.dataTransfer.dropEffect = 'move';
        const targetId = item.getAttribute('data-node-id');
        if (!draggedId || targetId === draggedId) return;
  
        clearLayerDragIndicators(panel);
        const zone = getDropZone(e, item);
        const kind = item.getAttribute('data-node-kind');
        const isContainer = ['rect','ellipse','frame','group'].includes(kind);
  
        if (zone === 'nest' && isContainer) {
          item.classList.add('drag-over-nest');
        } else if (zone === 'above') {
          item.classList.add('drag-over-above');
        } else {
          item.classList.add('drag-over-below');
        }
      });
  
      // ── dragleave ──
      item.addEventListener('dragleave', () => {
        item.classList.remove('drag-over-nest', 'drag-over-above', 'drag-over-below');
      });
  
      // ── drop ── (#1 reparent, #2 reorder, #4 undo guard)
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearLayerDragIndicators(panel);
        const targetId = item.getAttribute('data-node-id');
        if (!draggedId || !api.getFdCanvas() || targetId === draggedId) return;
  
        const textBefore = api.getFdCanvas().get_text();
        const zone = getDropZone(e, item);
        const kind = item.getAttribute('data-node-kind');
        const isContainer = ['rect','ellipse','frame','group'].includes(kind);
        let changed = false;
  
        if (zone === 'nest' && isContainer) {
          // #1: Reparent into container (Alt = center, default = preserve position)
          changed = e.altKey && api.getFdCanvas().reparent_into_centered
            ? api.getFdCanvas().reparent_into_centered(draggedId, targetId)
            : api.getFdCanvas().reparent_into(draggedId, targetId);
        } else {
          const targetItem = panel.querySelector(`.layer-item[data-node-id="${targetId}"]`);
          const dragItem = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
          
          let targetParent = targetItem?.parentElement?.getAttribute?.('data-parent-id') || null;
          let activeTargetId = targetId;

          // Drag-to-root (unindent): If user drags mouse horizontally left of the item text (approx 24px)
          const rect = targetItem.getBoundingClientRect();
          if (e.clientX - rect.left < 24 && targetParent) {
            // Find the root-level ancestor
            let currentParentId = targetParent;
            while (currentParentId) {
              const parentItem = panel.querySelector(`.layer-item[data-node-id="${currentParentId}"]`);
              if (!parentItem) break;
              activeTargetId = currentParentId;
              currentParentId = parentItem.parentElement?.getAttribute?.('data-parent-id') || null;
            }
            targetParent = null; // Detaching to root
          }

          const targetIndex = getSiblingIndex(panel, activeTargetId);
          // If we unnested, we logically drop it 'below' the entire group
          const insertIndex = (zone === 'above' && targetId === activeTargetId) ? targetIndex : targetIndex + 1;
          const dragParent = dragItem?.parentElement?.getAttribute?.('data-parent-id') || null;

          if (targetParent === dragParent) {
            // Same parent (including both being root) — pure reorder
            changed = api.getFdCanvas().reorder_child(draggedId, insertIndex);
          } else if (targetParent) {
            // Different parent — reparent into target's parent, then reorder
            changed = api.getFdCanvas().reparent_into(draggedId, targetParent);
            if (changed) {
              api.getFdCanvas().reorder_child(draggedId, insertIndex);
            }
          } else {
            // Target is at root level — reparent to root, then reorder
            changed = api.getFdCanvas().reparent_into(draggedId, 'root');
            // 'changed' might be false if already at root, but reorder still needs to happen
            api.getFdCanvas().reorder_child(draggedId, insertIndex);
            changed = true; // We triggered a mutation
          }
        }
  
        // #4: Undo snapshot guard
        if (changed) {
          const textAfter = api.getFdCanvas().get_text();
          if (textBefore !== textAfter) {
            api.getFdCanvas().push_undo_snapshot(textBefore, textAfter);
          }
          api.renderCanvas();
          api.syncCanvasToEditor();
          api.updatePropertiesPanel();
          refreshLayersPanel();
          // Flash the moved item to confirm the operation
          requestAnimationFrame(() => {
            const movedEl = panel.querySelector(`.layer-item[data-node-id="${draggedId}"]`);
            if (movedEl) {
              movedEl.classList.add('just-moved');
              movedEl.addEventListener('animationend', () => movedEl.classList.remove('just-moved'), { once: true });
            }
          });
        }
        draggedId = null;
      });
  
      // ── dragend ── (cleanup)
      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        clearLayerDragIndicators(panel);
        draggedId = null;
      });
    });
  
    // #5: Drop-to-root — drop on empty space in layers-body
    const layersBody = panel.querySelector('.layers-body');
    if (layersBody) {
      layersBody.addEventListener('dragover', (e) => {
        // Only highlight if dropping on empty space (not on a layer-item)
        if (e.target.closest('.layer-item')) return;
        e.preventDefault();
        e.stopPropagation(); // prevent canvasWrapper from overriding dropEffect
        e.dataTransfer.dropEffect = 'move';
        clearLayerDragIndicators(panel);
        layersBody.classList.add('drag-over-root');
      });
      layersBody.addEventListener('dragleave', (e) => {
        if (!layersBody.contains(e.relatedTarget) || e.relatedTarget?.closest('.layer-item')) {
          layersBody.classList.remove('drag-over-root');
        }
      });
      layersBody.addEventListener('drop', (e) => {
        if (e.target.closest('.layer-item')) return; // handled by item drop
        e.preventDefault();
        e.stopPropagation(); // prevent canvasWrapper from processing this drop
        layersBody.classList.remove('drag-over-root');
        if (!draggedId || !api.getFdCanvas()) return;
  
        const textBefore = api.getFdCanvas().get_text();
        const changed = api.getFdCanvas().reparent_into(draggedId, 'root');
        if (changed) {
          const textAfter = api.getFdCanvas().get_text();
          if (textBefore !== textAfter) {
            api.getFdCanvas().push_undo_snapshot(textBefore, textAfter);
          }
          api.renderCanvas();
          api.syncCanvasToEditor();
          api.updatePropertiesPanel();
          refreshLayersPanel();
        }
        draggedId = null;
      });
    }
  }
  
  /** Wire right-click context menu on layer items — uses unified ContextMenu. */
  function wireLayerContextMenu(panel) {
    if (!api.getFdCanvas()) return;
  
    panel.querySelectorAll('.layer-item').forEach(item => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
  
        const nodeId = item.getAttribute('data-node-id');
        if (!nodeId) return;
  
        // Determine selection state for enable/disable logic
        const selectedIds = JSON.parse(api.getFdCanvas().get_selected_ids());
        if (!selectedIds.includes(nodeId)) {
          api.getFdCanvas().select_by_id(nodeId);
        }
        const nodeKind = item.getAttribute('data-node-kind');
        const isContainer = ['rect','ellipse','frame','group'].includes(nodeKind);
        const hasChildren = !!item.nextElementSibling?.classList.contains('layer-children');
        const canGroup = selectedIds.length >= 2 || (selectedIds.includes(nodeId) && selectedIds.length >= 2);
        let canUngroup = false;
        const source = api.getFdCanvas().get_text();
        for (const id of selectedIds) {
          if (new RegExp(`(?:^|\\n)\\s*group\\s+@${id}\\b`).test(source)) {
            canUngroup = true;
            break;
          }
        }
        const isLocked = api.getFdCanvas().is_node_locked ? api.getFdCanvas().is_node_locked(nodeId) : false;
  
        // Build items array
        const items = [];
  
        // Rename
        items.push({ type: 'action', icon: '✏️', label: 'Rename', action: 'rename' });
        items.push({ type: 'separator' });
  
        // Clipboard
        items.push({ type: 'action', icon: '✂', label: 'Cut', shortcut: '⌘X', action: 'cut' });
        items.push({ type: 'action', icon: '⎘', label: 'Copy', shortcut: '⌘C', action: 'copy' });
        items.push({ type: 'action', icon: '📋', label: 'Paste', shortcut: '⌘V', action: 'paste' });
        items.push({ type: 'action', icon: '🖼', label: 'Copy as PNG', shortcut: '⌘⇧C', action: 'copy-png' });
        items.push({ type: 'separator' });
  
        // Structure
        items.push({ type: 'action', icon: '⊕', label: 'Duplicate', shortcut: '⌘D', action: 'duplicate' });
        items.push({ type: 'action', icon: '◻', label: 'Group', shortcut: '⌘G', action: 'group', disabled: !canGroup });
        items.push({ type: 'action', icon: '◫', label: 'Ungroup', shortcut: '⇧⌘G', action: 'ungroup', disabled: !canUngroup });
        items.push({ type: 'action', icon: '⊞', label: 'Frame Selection', action: 'frame' });
        items.push({ type: 'separator' });
  
        // Z-order
        items.push({ type: 'action', icon: '↑', label: 'Bring to Front', shortcut: '⌘⇧]', action: 'bring-front' });
        items.push({ type: 'action', icon: '↓', label: 'Send to Back', shortcut: '⌘⇧[', action: 'send-back' });
  
        // Lock
        items.push({ type: 'action', icon: isLocked ? '🔓' : '🔒', label: isLocked ? 'Unlock' : 'Lock', action: 'lock' });
  
        // Select Children (containers only)
        if (isContainer && hasChildren) {
          items.push({ type: 'action', icon: '📂', label: 'Select Children', action: 'select-children' });
        }
        items.push({ type: 'separator' });
  
        // Move Into — opens searchable picker
        items.push({ type: 'action', icon: '📦', label: 'Move Into…', action: 'move-into-search' });
        items.push({ type: 'action', icon: '↑', label: 'Move to Root', action: 'move-to-root' });
        items.push({ type: 'separator' });
  
        // Delete
        items.push({ type: 'action', icon: '✕', label: 'Delete', shortcut: '⌫', action: 'delete', danger: true });
  
        // Action handler for layer-specific actions
        const doLayerAction = (action, el) => {
          const textBefore = api.getFdCanvas().get_text();
          let changed = false;
  
          if (action === 'rename') {
            const nameEl = item.querySelector('.layer-name');
            if (nameEl) nameEl.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            return;
          } else if (action === 'cut') {
            api.copySelectedAsFd();
            changed = api.getFdCanvas().delete_selected();
          } else if (action === 'copy') {
            api.copySelectedAsFd();
            return;
          } else if (action === 'paste') {
            api.pasteFromClipboard().then(() => {
              api.renderCanvas(); api.syncCanvasToEditor();
              api.updatePropertiesPanel(); refreshLayersPanel();
            });
            return;
          } else if (action === 'copy-png') {
            if (typeof copySelectionAsPng === 'function') copySelectionAsPng();
            return;
          } else if (action === 'duplicate') {
            changed = api.getFdCanvas().duplicate_selected();
          } else if (action === 'group') {
            changed = api.getFdCanvas().group_selected();
          } else if (action === 'ungroup') {
            changed = api.getFdCanvas().ungroup_selected();
          } else if (action === 'frame') {
            const resultJson = api.getFdCanvas().handle_key('f', false, false, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'bring-front') {
            const resultJson = api.getFdCanvas().handle_key(']', false, true, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'send-back') {
            const resultJson = api.getFdCanvas().handle_key('[', false, true, false, true);
            const result = JSON.parse(resultJson);
            changed = result.changed;
          } else if (action === 'lock') {
            if (api.getFdCanvas().toggle_node_locked) {
              api.getFdCanvas().toggle_node_locked(nodeId);
              changed = true;
            }
          } else if (action === 'select-children') {
            const childrenContainer = panel.querySelector(`.layer-children[data-parent-id="${nodeId}"]`);
            if (childrenContainer) {
              const childIds = [...childrenContainer.querySelectorAll(':scope > .layer-item')].map(
                el => el.getAttribute('data-node-id')
              ).filter(Boolean);
              if (childIds.length > 0) {
                api.getFdCanvas().select_multiple_by_ids(JSON.stringify(childIds));
                api.renderCanvas();
                api.updatePropertiesPanel();
                refreshLayersPanel();
              }
            }
            return;
          } else if (action === 'move-into-search') {
            showSearchableParentPicker(nodeId, e.clientX ?? 200, e.clientY ?? 200);
            return; // picker handles its own undo
          } else if (action === 'move-into') {
            const targetId = el?.getAttribute('data-target');
            if (targetId) changed = api.getFdCanvas().reparent_into(nodeId, targetId);
          } else if (action === 'center-into') {
            const targetId = el?.getAttribute('data-target');
            if (targetId) {
              changed = api.getFdCanvas().reparent_into_centered
                ? api.getFdCanvas().reparent_into_centered(nodeId, targetId)
                : api.getFdCanvas().reparent_into(nodeId, targetId);
            }
          } else if (action === 'move-to-root') {
            changed = api.getFdCanvas().reparent_into(nodeId, 'root');
          } else if (action === 'delete') {
            changed = api.getFdCanvas().delete_selected();
          }
  
          if (changed) {
            const textAfter = api.getFdCanvas().get_text();
            if (textBefore !== textAfter) {
              api.getFdCanvas().push_undo_snapshot(textBefore, textAfter);
            }
            api.renderCanvas();
            api.syncCanvasToEditor();
            api.updatePropertiesPanel();
            refreshLayersPanel();
          }
        };
  
        api.ctxMenu.open({
          items,
          x: e.clientX,
          y: e.clientY,
          onAction: doLayerAction,
        });
      });
    });
  }
  
  /** Refresh the layers panel. */
  function refreshLayersPanel() {
    const panel = document.getElementById('layers-panel');
    if (!panel || !api.getFdCanvas()) return;
  
    // Use full set of selected IDs for multi-select highlighting
    const selectedIds = new Set(JSON.parse(api.getFdCanvas().get_selected_ids()));
    const selectedKey = [...selectedIds].sort().join(',');
    const source = api.getFdCanvas().get_text();
  
    // Selection-only change: just update highlights
    if (source === lastLayerText && selectedKey !== lastLayerSelectedId) {
      lastLayerSelectedId = selectedKey;
      panel.querySelectorAll('.layer-item').forEach(el => {
        const isSelected = selectedIds.has(el.getAttribute('data-node-id'));
        el.classList.toggle('selected', isSelected);
        if (isSelected) {
          let current = el.closest('.layer-children');
          while (current) {
            if (current.classList.contains('collapsed')) {
              current.classList.remove('collapsed');
              const parentId = current.getAttribute('data-parent-id');
              const chevron = panel.querySelector(`.layer-chevron[data-toggle-id="${parentId}"]`);
              if (chevron) chevron.classList.add('expanded');
            }
            current = current.parentElement?.closest('.layer-children');
          }
        }
      });
      const sel = panel.querySelector('.layer-item.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      return;
    }
  
    // No change at all
    if (source === lastLayerText && selectedKey === lastLayerSelectedId) return;
  
    lastLayerText = source;
    lastLayerSelectedId = selectedKey;
  
    const tree = parseLayerTree(source);
    const countNodes = (nodes) => nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
    const total = countNodes(tree);

    let selCount = 0;
    try {
      if (api.getFdCanvas()) {
        selCount = JSON.parse(api.getFdCanvas().get_selected_ids()).length;
      }
    } catch (_) {}

    const countText = selCount > 0 
      ? `${selCount} / ${total} selected` 
      : `${total} node${total !== 1 ? 's' : ''}`;

    let html = '<div class="layers-body">';
    for (const node of tree) html += renderLayerNode(node, selectedIds);
    html += '</div>';

    html += '<div class="layers-header" id="layers-header-toggle">';
    html += `<span class="layers-count" data-total="${total}">${countText}</span>`;
    html += '<div class="layers-action-bar">';
    html += '<button class="layer-action-btn" id="ai-touch-btn" title="AI Touch"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 4 4"/><path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m2 22 5.5-1.5L21.17 6.83a2.82 2.82 0 0 0-4-4L3.5 16.5Z"/><path d="m18 16 2-2"/><path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17"/></svg> AI Touch</button>';
    html += '</div></div>';
  
    panel.innerHTML = html;
  
    // Wire click-to-select with ⌘+click multi and ⇧+click range
    panel.querySelectorAll('.layer-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.layer-chevron')) return;
        e.stopPropagation();
        const nodeId = item.getAttribute('data-node-id');
        if (!nodeId || !api.getFdCanvas()) return;
  
        // ⌘+click (Mac) / Ctrl+click — toggle
        if (e.metaKey || e.ctrlKey) {
          api.getFdCanvas().toggle_select_by_id(nodeId);
          lastClickedLayerId = nodeId;
          const newIds = new Set(JSON.parse(api.getFdCanvas().get_selected_ids()));
          lastLayerSelectedId = [...newIds].sort().join(',');
          panel.querySelectorAll('.layer-item').forEach(el =>
            el.classList.toggle('selected', newIds.has(el.getAttribute('data-node-id')))
          );
          api.markRenderDirty();
          api.updatePropertiesPanel();
          return;
        }
  
        // ⇧+click — range select
        if (e.shiftKey && lastClickedLayerId) {
          const flatIds = flattenLayerTree(tree, panel);
          const startIdx = flatIds.indexOf(lastClickedLayerId);
          const endIdx = flatIds.indexOf(nodeId);
          if (startIdx >= 0 && endIdx >= 0) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            const rangeIds = flatIds.slice(lo, hi + 1);
            api.getFdCanvas().select_multiple_by_ids(JSON.stringify(rangeIds));
            const newIds = new Set(rangeIds);
            lastLayerSelectedId = [...newIds].sort().join(',');
            panel.querySelectorAll('.layer-item').forEach(el =>
              el.classList.toggle('selected', newIds.has(el.getAttribute('data-node-id')))
            );
            api.markRenderDirty();
            api.updatePropertiesPanel();
            return;
          }
        }
  
        // Plain click — single select
        lastClickedLayerId = nodeId;
        api.getFdCanvas().select_by_id(nodeId);
        api.renderCanvas();
        if (api.focusOnNode) api.focusOnNode(nodeId);
        lastLayerSelectedId = nodeId;
        panel.querySelectorAll('.layer-item').forEach(el =>
          el.classList.toggle('selected', el.getAttribute('data-node-id') === nodeId)
        );
        api.updateFab(document.getElementById('fd-canvas'));
        api.updatePropertiesPanel();
      });
    });
  
    // Wire chevron toggle
    panel.querySelectorAll('.layer-chevron:not(.empty)').forEach(chevron => {
      chevron.addEventListener('click', (e) => {
        e.stopPropagation();
        const toggleId = chevron.getAttribute('data-toggle-id');
        const childrenEl = panel.querySelector(`.layer-children[data-parent-id="${toggleId}"]`);
        if (childrenEl) {
          const collapsed = childrenEl.classList.toggle('collapsed');
          chevron.classList.toggle('expanded', !collapsed);
        }
      });
    });
  
    // ── Layer Drag-and-Drop (#1 reparent, #2 reorder, #5 drop-to-root) ──
    wireLayerDragDrop(panel);
  
    // ── Layer Context Menu (#3 "Move Into") ──
    wireLayerContextMenu(panel);

    // ── Layer Delete Buttons ──
    panel.querySelectorAll('.layer-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.layer-item');
        if (!item || !api.getFdCanvas()) return;
        const nodeId = item.getAttribute('data-node-id');
        api.getFdCanvas().select_by_id(nodeId);
        if (api.getFdCanvas().delete_selected()) {
          api.markRenderDirty();
          api.renderCanvas();
          api.syncCanvasToEditor();
          refreshLayersPanel();
          api.updatePropertiesPanel();
        }
      });
    });

    // ── Inline Renaming ──
    panel.querySelectorAll('.layer-name').forEach(nameEl => {
      nameEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        const item = nameEl.closest('.layer-item');
        if (!item || !api.getFdCanvas()) return;
        
        const oldId = item.getAttribute('data-node-id');
        nameEl.contentEditable = true;
        nameEl.focus();
        
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        const finishRename = () => {
          nameEl.contentEditable = false;
          let newId = nameEl.textContent.trim();
          
          if (!newId || newId === oldId) {
            nameEl.textContent = oldId;
            return;
          }
          if (!/^[a-zA-Z0-9_\-]+$/.test(newId)) {
            api.showToast('Invalid ID name (use alphanumeric, dash, underscore)');
            nameEl.textContent = oldId;
            return;
          }
          if (api.getFdCanvas().has_node(newId)) {
            api.showToast(`ID "@${newId}" already exists`);
            nameEl.textContent = oldId;
            return;
          }
          
          const oldText = api.getFdCanvas().get_text();
          const escapedOldId = oldId.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
          const regex = new RegExp(`@${escapedOldId}(?=[^a-zA-Z0-9_\\-]|$)`, 'g');
          const newText = oldText.replace(regex, `@${newId}`);
          
          api.getFdCanvas().set_text(newText);
          api.syncCanvasToEditor();
          refreshLayersPanel();
          api.updatePropertiesPanel();
          api.showToast(`Renamed ${oldId} to ${newId}`);
        };

        nameEl.addEventListener('blur', finishRename, { once: true });
        nameEl.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') {
            ke.preventDefault();
            nameEl.blur();
          } else if (ke.key === 'Escape') {
            nameEl.textContent = oldId;
            nameEl.blur();
          }
        });
      });
    });
  
    // ── Layers Action Bar (AI Touch) ──
    const aiTouchBtn = panel.querySelector('#ai-touch-btn');
    if (aiTouchBtn) {
      aiTouchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const renamifyBtn = document.getElementById('renamify-btn');
        if (renamifyBtn) renamifyBtn.click();
        else api.showToast('AI Touch invoked');
      });
    }


    // ── Keyboard shortcuts when layers panel is focused (#7) ──
    wireLayerKeyboardShortcuts(panel);

    // ── Auto-expand parents of selected items and scroll into view ──
    panel.querySelectorAll('.layer-item.selected').forEach(el => {
      let current = el.closest('.layer-children');
      while (current) {
        if (current.classList.contains('collapsed')) {
          current.classList.remove('collapsed');
          const parentId = current.getAttribute('data-parent-id');
          const chevron = panel.querySelector(`.layer-chevron[data-toggle-id="${parentId}"]`);
          if (chevron) chevron.classList.add('expanded');
        }
        current = current.parentElement?.closest('.layer-children');
      }
    });
    const sel = panel.querySelector('.layer-item.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  
  /** Wire keyboard shortcuts for layers panel — Delete, ⌘C/X/V/D */
  function wireLayerKeyboardShortcuts(panel) {
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    if (panel._layerKeysWired) return;
    panel._layerKeysWired = true;
  
    panel.addEventListener('keydown', (e) => {
      if (!api.getFdCanvas()) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
  
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault(); e.stopPropagation();
        if (api.getFdCanvas().delete_selected()) {
          api.renderCanvas(); api.syncCanvasToEditor();
          api.updatePropertiesPanel(); refreshLayersPanel();
        }
        return;
      }
      if (meta && key === 'd') {
        e.preventDefault(); e.stopPropagation();
        if (api.getFdCanvas().duplicate_selected()) {
          api.renderCanvas(); api.syncCanvasToEditor();
          api.updatePropertiesPanel(); refreshLayersPanel();
        }
        return;
      }
      if (meta && key === 'c' && !e.shiftKey) {
        e.preventDefault(); e.stopPropagation();
        api.copySelectedAsFd(); return;
      }
      if (meta && key === 'x') {
        e.preventDefault(); e.stopPropagation();
        api.cutSelectedAsFd();
        api.renderCanvas(); api.syncCanvasToEditor();
        api.updatePropertiesPanel(); refreshLayersPanel();
        return;
      }
      if (meta && key === 'v') {
        e.preventDefault(); e.stopPropagation();
        api.pasteFromClipboard().then(() => {
          api.renderCanvas(); api.syncCanvasToEditor();
          api.updatePropertiesPanel(); refreshLayersPanel();
        });
        return;
      }
    });
  }

  // Live update layer count on canvas selection
  document.addEventListener('fd-selection-changed', (e) => {
    const pnl = document.getElementById('layers-panel');
    if (!pnl) return;
    const countEl = pnl.querySelector('.layers-count');
    if (!countEl) return;
    const total = countEl.dataset.total || '0';
    const c = e.detail?.ids?.length || 0;
    countEl.textContent = c > 0 ? `${c} / ${total} selected` : `${total} node${total !== '1' ? 's' : ''}`;
  });

  return { refreshLayersPanel };
}
