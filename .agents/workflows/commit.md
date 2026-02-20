---
description: Stage and commit changes to a feature branch (never main)
---

# Commit Workflow

// turbo-all

1. Check current branch — never commit to `main`:

   ```bash
   git branch --show-current
   ```

2. If on `main`, create and switch to a feature branch:

   ```bash
   git checkout -b feat/<descriptive-name>
   ```

3. Stage all changes:

   ```bash
   git add -A
   ```

4. Review what's staged:

   ```bash
   git diff --cached --stat
   ```

5. Commit with a conventional commit message:

   ```bash
   git commit -m "<type>(<scope>): <description>"
   ```

   Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`
   Scopes: `core`, `render`, `editor`, `vscode`, `docs`, `ci`

6. Push to remote:
   ```bash
   git push -u origin HEAD
   ```
