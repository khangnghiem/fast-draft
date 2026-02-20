---
description: Full pipeline - test, build, commit, and PR in one shot
---

# Yolo Workflow

> For small, confident changes. Runs the full pipeline automatically.

// turbo-all

1. **Lint**:

   ```bash
   cargo clippy --workspace -- -D warnings
   ```

2. **Format**:

   ```bash
   cargo fmt --all
   ```

3. **Test**:

   ```bash
   cargo test --workspace
   ```

4. **Check branch** (never commit to main):

   ```bash
   git branch --show-current
   ```

5. If on `main`, create a feature branch:

   ```bash
   git checkout -b feat/<descriptive-name>
   ```

6. **Stage and commit**:

   ```bash
   git add -A
   git commit -m "<type>(<scope>): <description>"
   ```

7. **Push**:

   ```bash
   git push -u origin HEAD
   ```

8. **Create PR** using GitKraken MCP:
   - `provider`: github
   - `source_branch`: current branch
   - `target_branch`: main
   - Title in conventional format
   - Body summarizing changes + test results

9. Report PR URL to user.
