// ─── canvas-core/clipboard.js ─── Shared clipboard utilities
// Pure FD text manipulation — no DOM or platform dependencies.

/**
 * Extract the .fd text block for a single node by its ID.
 * @param {string} text - Full FD source text
 * @param {string} nodeId - Node ID (without @)
 * @returns {string} The block string, or "" if not found
 */
export function extractNodeBlock(text, nodeId) {
  const lines = text.split('\n');
  const startPattern = new RegExp(`^\\s*(\\w+)\\s+@${nodeId}\\b`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return '';

  const startIndent = lines[startIdx].match(/^\s*/)[0].length;
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx];
    if (line.trim().length === 0) { endIdx++; continue; }
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= startIndent) break;
    endIdx++;
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

/**
 * Build a batch-aware ID rename map for paste operations.
 * Ensures pasted nodes get unique IDs that don't conflict with existing text.
 *
 * @param {Set<string>} allIds - Set of @id declarations in the pasted block
 * @param {string} existingText - Current FD source text (for conflict detection)
 * @returns {Map<string, string>} Map of oldId → newId
 */
export function buildPasteIdMap(allIds, existingText) {
  const idMap = new Map();
  const batchMaxCache = new Map();

  for (const oldId of allIds) {
    const stem = oldId.replace(/_(?:\d+|cp\d+)$/, '');
    let maxN = batchMaxCache.get(stem) || 0;
    if (maxN === 0) {
      maxN = 1;
      const re = new RegExp(`@${stem}_(\\d+)\\b`, 'g');
      let match;
      while ((match = re.exec(existingText)) !== null) {
        maxN = Math.max(maxN, parseInt(match[1]));
      }
      if (new RegExp(`@${stem}\\b`).test(existingText)) {
        maxN = Math.max(maxN, 1);
      }
    }
    const newN = maxN + 1;
    batchMaxCache.set(stem, newN);
    idMap.set(oldId, stem + '_' + newN);
  }

  return idMap;
}

/**
 * Apply an ID rename map to pasted FD text.
 * Replaces all @oldId references with @newId.
 *
 * @param {string} pasteText - FD text to rename IDs in
 * @param {Map<string, string>} idMap - Map of oldId → newId
 * @returns {string} Text with renamed IDs
 */
export function applyIdRenames(pasteText, idMap) {
  let result = pasteText;
  for (const [oldId, newId] of idMap) {
    result = result.replace(new RegExp(`@${oldId}\\b`, 'g'), `@${newId}`);
  }
  return result;
}

/**
 * Collect all @id declarations from FD text.
 * @param {string} text - FD source text
 * @returns {Set<string>} Set of declared node IDs
 */
export function collectDeclaredIds(text) {
  const idPattern = /@(\w+)\s*\{/g;
  const ids = new Set();
  let m;
  while ((m = idPattern.exec(text)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

/**
 * Transforms pasted FD text for importing as a component/module.
 * Implements Smart Detection + Namespace prefixing.
 *
 * @param {string} text - The raw FD text to import
 * @param {string} namespace - The prefix namespace (e.g. "buttons")
 * @returns {string} The transformed FD text ready to be inserted
 */
export function buildImportText(text, namespace) {
  if (!text || !text.trim()) return '';
  const lines = text.split('\n');

  // Regex to detect top-level node definitions
  // Matches "rect @id {...}" or "group @id {" etc, ignoring whitespace at start
  const topLevelPattern = /^\s*(group|frame|rect|ellipse|path|text|edge|style)\s+@(\w+)/;
  
  let rootBlocksCount = 0;
  for (const line of lines) {
    // Only count lines that represent root-level blocks (not indented)
    // Actually, simple heuristic: just count occurrences of node starts without heavy indentation
    if (topLevelPattern.test(line)) {
      if (!line.match(/^\s{2,}/)) { // A true root node shouldn't have indent >= 2 spaces
        rootBlocksCount++;
      }
    }
  }

  // 1. Rename all @ids to @namespace.id
  let processedText = text;
  
  // Find all declared IDs to rename properly
  const allIdsPattern = /@(\w+)/g;
  const allIds = new Set();
  let match;
  while ((match = allIdsPattern.exec(text)) !== null) {
    // Ignore if already namespaced like @ns.id or reserved
    if (match[1] !== 'canvas') {
      allIds.add(match[1]);
    }
  }
  
  for (const id of allIds) {
    // Basic regex replace with word boundaries. Allows dot notation.
    processedText = processedText.replace(new RegExp(`@${id}\\b`, 'g'), `@${namespace}.${id}`);
  }

  // 2. Wrap if needed (Smart Detection)
  let finalText = processedText.trim();
  
  if (rootBlocksCount === 0) {
    return text; // No valid FD blocks found, just return original to let parser handle/error
  }
  
  if (rootBlocksCount === 1) {
    // #3 Smart Detection: Single root -> flat structure, no wrapper
    // The namespace prefix already applied above.
  } else {
    // Multi-root -> #1 Group Wrap
    // Wrap the entire processed text in a group labeled @import_namespace
    
    // Indent the original text for clean formatting
    const indented = finalText.split('\n').map(l => l ? '  ' + l : l).join('\n');
    finalText = `group @import_${namespace} {\n${indented}\n}`;
  }

  return finalText;
}
