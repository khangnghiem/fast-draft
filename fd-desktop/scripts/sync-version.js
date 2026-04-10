const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const tauriDir = path.join(projectRoot, 'src-tauri');

// 1. Read source of truth: fd-desktop/package.json
const pkgPath = path.join(projectRoot, 'package.json');
const pkgStr = fs.readFileSync(pkgPath, 'utf8');
const pkg = JSON.parse(pkgStr);
const version = pkg.version;

if (!version) {
  console.error("❌ Error: No version found in package.json");
  process.exit(1);
}

console.log(`[Version Sync] Source of truth: v${version}`);

// 2. Update fd-desktop/src-tauri/tauri.conf.json
const tauriConfPath = path.join(tauriDir, 'tauri.conf.json');
const tauriConfStr = fs.readFileSync(tauriConfPath, 'utf8');
const tauriConf = JSON.parse(tauriConfStr);

if (tauriConf.version !== version) {
  tauriConf.version = version;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
  console.log(`[Version Sync] Updated tauri.conf.json to v${version}`);
} else {
  console.log(`[Version Sync] tauri.conf.json is already v${version}`);
}

// 3. Update fd-desktop/src-tauri/Cargo.toml
const cargoTomlPath = path.join(tauriDir, 'Cargo.toml');
let cargoTomlStr = fs.readFileSync(cargoTomlPath, 'utf8');

// Regex to match version = "..." inside [package]
const versionRegex = /^version\s*=\s*"[^"]+"/m;
const newVersionStr = `version = "${version}"`;

if (versionRegex.test(cargoTomlStr)) {
  const updatedCargoToml = cargoTomlStr.replace(versionRegex, newVersionStr);
  if (updatedCargoToml !== cargoTomlStr) {
    fs.writeFileSync(cargoTomlPath, updatedCargoToml);
    console.log(`[Version Sync] Updated Cargo.toml to v${version}`);
  } else {
    console.log(`[Version Sync] Cargo.toml is already v${version}`);
  }
} else {
  console.warn("⚠️ Warning: Could not find version field in Cargo.toml [package] section");
}

console.log("[Version Sync] ✅ Complete");
