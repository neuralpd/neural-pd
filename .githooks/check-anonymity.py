#!/usr/bin/env python3
"""Check commit identities and attribution without printing personal details."""

import re
import subprocess
import sys
from pathlib import Path

IDENTITY = "Anonymous <anonymous@anonymous.invalid>"
ATTRIBUTION = re.compile(r"^\s*[\w-]+-by\s*:", re.IGNORECASE | re.MULTILINE)


def git(*args):
    return subprocess.check_output(["git", *args], encoding="utf-8", errors="replace")


def reject(reason):
    sys.exit(f"Anonymity check failed: {reason}")


def check_identity(value):
    if not re.fullmatch(re.escape(IDENTITY) + r" \d+ [+-]\d{4}", value.strip()):
        reject("author and committer must both be " + IDENTITY)


def check_message(message):
    if ATTRIBUTION.search(message):
        reject("remove attribution trailers (such as Co-authored-by or Signed-off-by).")


def check_commit(oid):
    raw = git("cat-file", "commit", oid)
    headers, _, message = raw.partition("\n\n")
    for field in ("author", "committer"):
        values = [line[len(field) + 1:] for line in headers.splitlines()
                  if line.startswith(field + " ")]
        if len(values) != 1:
            reject("missing commit identity.")
        check_identity(values[0])
    if any(line.startswith(("gpgsig ", "gpgsig-sha256 ", "mergetag "))
           for line in headers.splitlines()):
        reject("signed commits or embedded signed tags may identify their signer.")
    check_message(message)


def main():
    mode = sys.argv[1]
    if mode in ("identity", "message"):
        for field in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
            check_identity(git("var", field))
    if mode == "message":
        check_message(Path(sys.argv[2]).read_text(encoding="utf-8", errors="replace"))
    elif mode == "push":
        checked = set()
        for update in sys.stdin:
            _, oid, _, _ = update.split()
            if set(oid) == {"0"}:  # Deleting a remote ref publishes no commits.
                continue
            if git("cat-file", "-t", oid).strip() == "tag":
                reject("annotated tags contain separate tagger metadata; use lightweight tags.")
            # Audit all reachable history, including commits made with hooks bypassed.
            for commit in git("rev-list", oid).splitlines():
                if commit not in checked:
                    check_commit(commit)
                    checked.add(commit)


if __name__ == "__main__":
    main()
