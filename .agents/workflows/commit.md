---
description: Stage and commit changes to a feature branch (never main)
---

# Commit Workflow

// turbo-all

1. **Activate pre-push hook** (one-time per clone — blocks accidental pushes to `main`):

   ```bash
   git config core.hooksPath .githooks
   ```

2. Check current branch — never commit to `main`:

   ```bash
   git branch --show-current
   ```

3. If on `main`, create and switch to a feature branch:

   ```bash
   git checkout -b feat/<descriptive-name>
   ```

4. **Update docs** (MANDATORY — both files, every time):
   - `docs/CHANGELOG.md` — add entry for each meaningful change
   - `REQUIREMENTS.md` — for **every** CHANGELOG entry, check if it introduces, extends, or modifies a requirement:
     - New feature → add a new `R*.N` entry and update the Requirement Index
     - Behavior change → update the existing requirement's wording
     - Bug fix on an existing requirement → no change needed
     - Search the Requirement Index for overlap before adding new entries

5. Stage all changes:

   ```bash
   git add -A
   ```

6. Review what's staged:

   ```bash
   git diff --cached --stat
   ```

7. Commit with a conventional commit message:

   ```bash
   git commit -m "<type>(<scope>): <description>"
   ```

   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`
   Scopes: `core`, `render`, `editor`, `vscode`, `docs`, `ci`

8. Push to remote:
   ```bash
   git push -u origin HEAD
   ```
