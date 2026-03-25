// ─── CodeMirror 6 Vendor Entry ───────────────────────────────────────────
// Re-exports all symbols used by app.js from locally installed packages.
// Bundle with: npx esbuild vendor/cm-entry.js --bundle --format=esm --minify --outfile=vendor/cm.min.js

// @codemirror/state
export { EditorState, Compartment } from '@codemirror/state';

// @codemirror/view
export {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, tooltips, hoverTooltip
} from '@codemirror/view';

// @codemirror/language
export { StreamLanguage, HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';

// @lezer/highlight
export { tags } from '@lezer/highlight';

// @codemirror/autocomplete
export { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';

// @codemirror/lint
export { linter, lintGutter } from '@codemirror/lint';

// @codemirror/commands
export { defaultKeymap, history, historyKeymap } from '@codemirror/commands';

// @codemirror/search
export { highlightSelectionMatches } from '@codemirror/search';

// lz-string
export { default as LZString } from 'lz-string';
