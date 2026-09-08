# Documentation instructions

## Bilingual pairs

Documentation in this directory is bilingual:

- `*.md` without `_EN` is the Russian version.
- `*_EN.md` is the English version of the same document.
- `README.md` is the Russian documentation index.
- `README_EN.md` is the English documentation index.

## Context discipline

Do not read both language versions of the same document during ordinary implementation, debugging, review, or research tasks.

Choose one language version based on the task/user language and treat its paired translation as duplicate context.

Read both members of a pair only when the task explicitly concerns translation quality, documentation synchronization, or language parity.

When editing a technical fact that exists in a bilingual pair, keep both language versions semantically synchronized, but inspect only the focused sections required for the change.

Do not recursively ingest all of `docs/`. Start from `README.md` or `README_EN.md` and open only the document relevant to the current subsystem.
