# Anonymous paper website

Preserve double-blind anonymity in all changes and Git operations.

- Run `sh scripts/setup-anonymous-git.sh` after cloning, before committing.
- Both author and committer must be `Anonymous <anonymous@anonymous.invalid>`.
- Do not add personal names, emails, affiliations, account handles, local absolute
  paths, identifying URLs, attribution trailers, or signing keys to commits.
- Do not bypass the anonymity hooks or sign commits or tags with personal keys.
- Review new assets for metadata and visible identifiers before adding them.
- Use only anonymous hosting accounts and destinations when publishing. Local
  Git identity settings do not anonymize the account used to push or deploy.
- Do not commit or push unless the user requests it.

