# Security Policy

## Supported Versions

Currently, only the latest active major version receives security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.11.x  | :white_check_mark: |
| 0.10.x  | :x:                |
| < 0.10  | :x:                |

## Reporting a Vulnerability

Please report any suspected vulnerabilities by opening an issue or contacting the maintainers directly. We will provide an initial assessment within 24 hours.

---

## 🚨 Active Security Advisories

### **[Resolved] Open-VSX Registry Supply Chain Compromise (April 2026)**
**Discovered by:** `rcss` @ AikidoSec

We were informed of a supply chain attack specifically targeting the **Open-VSX Registry** for the `fast-draft` extension. A compromised publisher token was used to publish malicious extensions that download a Remote Access Trojan (RAT). 

#### **Affected Versions**
*Only* the following legacy versions downloaded from the **Open-VSX Registry** are affected:
- `0.10.89`
- `0.10.105`
- `0.10.106`
- `0.10.112`

> **Note:** The official VS Code Marketplace distributions (`0.11.x` and all prior) were **not** impacted by this breach. 

#### **Remediation & Action Plan**
1. **Remove Old Versions:** If you are using any of the affected versions (`0.10.89` to `0.10.112`) from Open-VSX (e.g., via VSCodium, Gitpod, or Coder), **uninstall the extension immediately**.
2. **Scan Your System:** We strongly recommend running a full anti-virus/malware scan if you installed the affected versions, as the payload installs a remote shell.
3. **Update:** Upgrade to the latest secure version `0.11.328` or newer, which has been published using newly secured infrastructure.

#### **Steps We Took**
- Revoked all existing Open-VSX publisher tokens.
- Audited repository history and verified no `.env` or CI secrets were exposed via git.
- scrubbed local environments and rotated all associated ecosystem tokens (`VSCE_PAT`, `NPM_TOKEN`, etc.).
- Contacted Open-VSX to permanently yank the malicious blobs from their servers.

We sincerely thank **rcss and the AikidoSec team** for their swift and responsible disclosure that allowed us to lock down the registry before further harm occurred.
