// ─── canvas-core/shortcuts.js ─── Shared shortcut data + help overlay HTML
// Platform-independent shortcut definitions and help overlay builder.

/** Tool shortcut key map (single-key shortcuts for tool activation). */
export const TOOL_SHORTCUTS = {
  r: 'rect',
  o: 'ellipse',
  p: 'pen',
  a: 'arrow',
  t: 'text',
  f: 'frame',
  e: 'eraser',
};

/** Tool cycle order (matches toolbar visual order). */
export const TOOL_CYCLE = ['hand', 'select', 'rect', 'ellipse', 'pen', 'arrow', 'text', 'eraser'];

/** Double-press threshold for tool locking (ms). */
export const DOUBLE_PRESS_MS = 400;

/** Zoom step multiplier for ⌘+/⌘− keyboard shortcuts. */
export const ZOOM_STEP = 1.25;

/**
 * Build the shortcut help overlay HTML.
 * @returns {string} HTML string for the shortcut help panel
 */
export function buildShortcutHelpHtml() {
  const isMac = typeof navigator !== 'undefined'
    ? navigator.platform.toUpperCase().indexOf('MAC') >= 0
    : true;
  const cmd = isMac ? '⌘' : 'Ctrl+';

  const sections = [
    {
      title: 'Tools',
      shortcuts: [
        ['V', 'Select / Move'],
        ['R', 'Rectangle'],
        ['O', 'Ellipse'],
        ['P', 'Pen (freehand)'],
        ['A', 'Arrow'],
        ['T', 'Text'],
        ['F', 'Frame'],
        ['E', 'Eraser'],
        ['Tab', 'Toggle last two tools'],
        ['R R', 'Lock tool (stays active)'],
        ['Escape', 'Unlock tool / Deselect'],
      ],
    },
    {
      title: 'Edit',
      shortcuts: [
        [`${cmd}Z`, 'Undo'],
        [`${cmd}⇧Z`, 'Redo'],
        ['Del / ⌫', 'Delete selected'],
        [`${cmd}D`, 'Duplicate (+10,+10)'],
        [`${cmd}A`, 'Select all'],
        [`${cmd}G`, 'Group selected'],
        [`${cmd}⇧G`, 'Ungroup'],
        [`${cmd}C`, 'Copy'],
        [`${cmd}X`, 'Cut'],
        [`${cmd}V`, 'Paste'],
        [`⌥${cmd}C`, 'Copy Style'],
        [`⌥${cmd}V`, 'Paste Style'],
      ],
    },
    {
      title: 'Transform',
      shortcuts: [
        [`${cmd}[`, 'Send backward'],
        [`${cmd}]`, 'Bring forward'],
        [`${cmd}⇧[`, 'Send to back'],
        [`${cmd}⇧]`, 'Bring to front'],
        ['Arrow keys', 'Nudge 1px'],
        ['Shift+Arrow', 'Nudge 10px'],
      ],
    },
    {
      title: 'View',
      shortcuts: [
        [`${cmd}+`, 'Zoom in'],
        [`${cmd}−`, 'Zoom out'],
        ['0', 'Reset zoom to 100%'],
        [`${cmd}0`, 'Zoom to fit'],
        [`${cmd}1`, 'Zoom to selection'],
        ['L', 'Toggle Layers panel'],
        ['G', 'Toggle grid overlay'],
        ['Space (hold)', 'Pan / hand tool'],
        [`${cmd} (hold)`, 'Temp. hand tool'],
        ['Pinch', 'Trackpad zoom'],
      ],
    },
    {
      title: 'Modifiers (while dragging)',
      shortcuts: [
        ['Shift', 'Constrain axis / square'],
        [`${cmd}Drag`, 'Nest into container', true],
        ['Alt+drag', 'Duplicate while moving'],
        [`${cmd}⌥Click`, 'Deep select child', true],
        ['Double-click', 'Edit text / create text'],
        ['Dbl-click tool', 'Lock tool (🔒)'],
      ],
    },
    {
      title: 'Apple Pencil Pro',
      shortcuts: [
        ['Squeeze', 'Toggle last two tools'],
        ['Barrel Roll', 'Rotate brush angle'],
      ],
    },
  ];

  let html = `
    <div class="help-panel">
      <div class="help-header">
        <h3>Keyboard Shortcuts</h3>
        <button class="help-close" aria-label="Close">×</button>
      </div>
      <div class="help-body">
  `;

  for (const section of sections) {
    html += `<div class="help-section"><h4>${section.title}</h4><dl>`;
    for (const item of section.shortcuts) {
      const key = item[0];
      const desc = item[1];
      const isNew = item[2];
      const badgeHtml = isNew ? `<span class="help-badge-new">New!</span>` : '';
      html += `<div class="help-row"><dt><kbd>${key}</kbd></dt><dd>${desc}${badgeHtml}</dd></div>`;
    }
    html += `</dl></div>`;
  }

  html += `
      </div>
      <div class="help-footer">Press <kbd>?</kbd> to close</div>
    </div>
  `;

  return html;
}
