export function buildUnifiedNodeMenu(nodeId, selectedIds, isContainer, hasChildren, isLocked, canGroup, canUngroup, sceneText) {
  const isMultiple = selectedIds.length > 1;
  const isSingle = !isMultiple;
  
  return [
    { type: 'header', label: isMultiple ? `${selectedIds.length} Nodes Selected` : `Node: ${nodeId}` },
    { type: 'action', icon: '⧉', label: 'Duplicate', shortcut: '⌘D', action: 'duplicate', disabled: false },
    { type: 'action', icon: '📷', label: 'Copy as PNG', shortcut: '⌘⇧E', action: 'copy-png', disabled: false },
    { type: 'action', icon: '📄', label: 'Copy FD Code', action: 'copy-fd', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '↑', label: 'Bring to Front', shortcut: '⌘⇧]', action: 'bring-front', disabled: false },
    { type: 'action', icon: '↓', label: 'Send to Back', shortcut: '⌘⇧[', action: 'send-back', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '⚏', label: 'Group', shortcut: '⌘G', action: 'group', disabled: !canGroup },
    { type: 'action', icon: '⬚', label: 'Frame Selection', shortcut: '⌘⌥G', action: 'frame', disabled: !isMultiple && !isContainer },
    { type: 'action', icon: '☷', label: 'Ungroup', shortcut: '⌘⇧G', action: 'ungroup', disabled: !canUngroup },
    { type: 'separator' },
    { type: 'action', icon: '↳', label: 'Move Into...', action: 'move-into-search', disabled: false },
    { type: 'action', icon: '↰', label: 'Move to Root', action: 'move-to-root', disabled: false },
    { type: 'action', icon: '⬚', label: 'Select Children', action: 'select-children', disabled: !hasChildren },
    { type: 'separator' },
    { type: 'action', icon: isLocked ? '🔓' : '🔒', label: isLocked ? 'Unlock' : 'Lock', shortcut: '⌘L', action: 'toggle-lock', disabled: false },
    { type: 'action', icon: '✏️', label: 'Rename', shortcut: '↵', action: 'rename', disabled: isMultiple },
    { type: 'action', icon: '💬', label: 'Add Spec/Note', action: 'add-spec', disabled: false },
    { type: 'action', icon: '✦', label: 'AI Touch', shortcut: '⌘I', action: 'ai-touch', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '🗑', label: 'Delete', shortcut: '⌫', action: 'delete', danger: true, disabled: false }
  ];
}

export function buildUnifiedEdgeMenu(edgeId) {
  return [
    { type: 'header', label: `Edge @${edgeId}` },
    { type: 'action', icon: '📋', label: 'Copy', shortcut: '⌘C', action: 'copy', disabled: false },
    { type: 'action', icon: '✂', label: 'Cut', shortcut: '⌘X', action: 'cut', disabled: false },
    { type: 'action', icon: '⧉', label: 'Duplicate', shortcut: '⌘D', action: 'duplicate', disabled: false },
    { type: 'action', icon: '🗑', label: 'Delete Edge', shortcut: '⌫', action: 'delete', danger: true, disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '↔', label: 'Reverse Direction', action: 'edge-reverse', disabled: false },
    { type: 'action', icon: '✏️', label: 'Edit Label', action: 'edge-edit-label', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '📄', label: 'Copy as .fd', action: 'copy-fd', disabled: false }
  ];
}

export function buildUnifiedCanvasMenu() {
  return [
    { type: 'action', icon: '📋', label: 'Paste', action: 'paste', shortcut: '⌘V', disabled: false },
    { type: 'action', icon: '▣', label: 'Select All', action: 'select-all', shortcut: '⌘A', disabled: false },
    { type: 'separator' },
    { type: 'action', icon: '➕', label: 'Add Node Here', action: 'add-node', disabled: false },
    { type: 'action', icon: '🔓', label: 'Unlock All', action: 'unlock-all', disabled: false } // We'll re-enable logic!
  ];
}
