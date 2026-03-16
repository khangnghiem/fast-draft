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
