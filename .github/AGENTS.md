# CI and automation guidance

Scope: `.github/`.

- Treat workflow YAML and scripts as executable sources of truth; avoid inferring current behavior from old CI logs or stale docs.
- For a failed GitHub Actions run, locate the failed job and step, then extract the exact error and a short surrounding log window before reading more.
- Do not ingest an entire verbose OpenWrt SDK log when a focused error search is sufficient.
- Preserve pinned action SHAs unless the task explicitly asks to update them.
- Keep package lists and verification gates consistent between build and release workflows.
- Prefer deterministic checks that fail when an expected APK/artifact is missing; do not accept a green workflow that silently skipped a requested package.
- For independent read-only inspections of workflow files, package Makefiles, and test scripts, batch the reads where possible.
- After a CI fix, validate the new commit/run rather than rerunning an obsolete SHA unless the task is specifically about reproducibility.
