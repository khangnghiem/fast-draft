import fs from 'fs';
import path from 'path';

// Get repository root assuming script runs from anywhere inside it (or just use process.cwd())
const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, 'fd-vscode', 'package.json');
const indexHtmlPath = path.join(repoRoot, 'site', 'index.html');

try {
  // 1. Read the latest version from package.json
  const packageData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageData.version;
  console.log(`[Bump] Detected version ${version} from package.json`);

  // 2. Read site/index.html
  let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  // 3. Replace all ?v=X.Y.Z strings with the new version
  const regex = /v=\d+\.\d+\.\d+/g;
  const matchCount = (indexHtml.match(regex) || []).length;
  
  if (matchCount > 0) {
    indexHtml = indexHtml.replace(regex, `v=${version}`);
    fs.writeFileSync(indexHtmlPath, indexHtml, 'utf8');
    console.log(`[Bump] Successfully updated ${matchCount} cache-busting strings in site/index.html to v=${version}`);
  } else {
    console.log('[Bump] No cache-busting strings found in site/index.html');
  }

} catch (e) {
  console.error('[Bump] Failed to bump versions:', e);
  process.exit(1);
}
