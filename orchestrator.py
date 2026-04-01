import subprocess
import datetime

def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.stdout.strip(), result.stderr.strip(), result.returncode

def get_test_count():
    out, err, code = run_cmd("cargo test --workspace -- --list 2>&1 | wc -l")
    try:
        count = int(out.strip())
        return count
    except:
        return 0

date_str = datetime.datetime.now().strftime("%Y-%m-%d")
test_count = get_test_count()

report_title = f"🌅 Jules Overnight Report — {date_str}"
report_body = f"""Total PRs merged: 0

List of changes by category:
- 🔨 Features: 0
- 🐛 Fixes: 0
- 🔧 Refactors: 0
- 🧪 Tests: 0
- 📝 Docs: 0

Skipped PRs:
All evaluated PRs were skipped. Reason: Failed to merge due to unrelated git histories (no common ancestor with main) and missing tests in PRs. Needs human review to rebase branches or check CI.

Current test count: {test_count}
Tag: overnight-report
"""

with open('overnight-report.md', 'w') as f:
    f.write(f"# {report_title}\n\n{report_body}")
