import { StreamLanguage, HighlightStyle, tags, EditorView } from '../../vendor/cm.min.js';

// ─── FD Language Definition (StreamLanguage) ─────────────────────────────
export const fdLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*/)) return 'comment';
    if (stream.match(/^"[^"]*"/)) return 'string';
    if (stream.match(/^(group|frame|rect|ellipse|path|text|edge|image|import)\b/)) return 'keyword';
    if (stream.match(/^(style|theme)\b/)) return 'keyword';
    if (stream.match(/^(when|spec)\b/)) return 'keyword';
    if (stream.match(/^(w|h|x|y|fill|stroke|font|corner|opacity|shadow|bg|layout|use|center_in|offset|gap|pad|scale|rotate|translate|ease|duration|cols|from|to|src|alt|align|clip|arrow|curve|flow|place|d|label_offset|todo|done|tag|role|trait|intent|extends|visible|cursor)\s*:/)) {
      return 'propertyName';
    }
    if (stream.match(/^@\w+/)) return 'variableName.special';
    if (stream.match(/^#[0-9A-Fa-f]{3,8}\b/)) return 'color';
    if (stream.match(/^\d+(\.\d+)?/)) return 'number';
    if (stream.match(/^(column|row|grid|free|spring|linear|ease_in|ease_out|ease_in_out|canvas|bold|italic|semibold|medium|light|thin|center|left|right|top|bottom|middle|cover|contain|none|start|end|both|smooth|straight|step|pulse|dash|todo|doing|done|blocked|low|high|critical)\b/)) {
      return 'atom';
    }
    if (stream.match(/^:(hover|press|enter)\b/)) return 'meta';
    if (stream.eat('{') || stream.eat('}')) return 'brace';
    stream.next();
    return null;
  },
});

// ─── Atom One Dark Theme for CodeMirror ──────────────────────────────────
export const fdHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: '#C678DD' },
  { tag: tags.comment, color: '#5C6370', fontStyle: 'italic' },
  { tag: tags.string, color: '#98C379' },
  { tag: tags.propertyName, color: '#E06C75' },
  { tag: tags.variableName, color: '#E5C07B' },
  { tag: tags.color, color: '#56B6C2' },
  { tag: tags.number, color: '#D19A66' },
  { tag: tags.atom, color: '#56B6C2' },
  { tag: tags.meta, color: '#61AFEF' },
  { tag: tags.brace, color: '#ABB2BF' },
]);

export const fdTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1a1b26',
    color: '#ABB2BF',
    fontSize: '13px',
    fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Monaco, "Courier New", monospace',
    height: '100%',
  },
  '.cm-content': {
    padding: '12px 0',
    caretColor: '#528bff',
  },
  '.cm-cursor': {
    borderLeftColor: '#528bff',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#3E4451 !important',
  },
  '.cm-activeLine': {
    backgroundColor: '#2c313c40',
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#2c313c40',
  },
  '.cm-gutters': {
    backgroundColor: '#1a1b26',
    color: '#495162',
    border: 'none',
    borderRight: '1px solid #2c313c',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '32px',
  },
  '.cm-lint-marker-error': {
    content: '"●"',
    color: '#E06C75',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: '#21252b',
    border: '1px solid #3E4451',
    borderRadius: '6px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  '.cm-tooltip-autocomplete ul li': {
    padding: '4px 10px',
    fontSize: '12px',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: '#2c313c',
    color: '#ABB2BF',
  },
  '.cm-tooltip-hover': {
    backgroundColor: '#21252b',
    border: '1px solid #3E4451',
    borderRadius: '6px',
    padding: '6px 10px',
    fontSize: '12px',
    lineHeight: '1.5',
    maxWidth: '400px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
  },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    textDecoration: 'underline wavy #E06C75',
    textDecorationSkipInk: 'none',
  },
  '.cm-matchingBracket': {
    backgroundColor: '#515a6b40',
    outline: '1px solid #515a6b',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
}, { dark: true });
