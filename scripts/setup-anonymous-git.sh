#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -e .git ]; then
    git init -b main
fi
for identity in user author committer; do
    git config --local "$identity.name" Anonymous
    git config --local "$identity.email" anonymous@anonymous.invalid
done
git config --local commit.gpgsign false
git config --local tag.gpgsign false
git config --local core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/commit-msg .githooks/pre-push
printf '%s\n' 'Anonymous Git identity and hooks enabled for this repository.'

