# LabLens — Restore Quarantined Files

All files removed from the submission tree were **moved, never deleted permanently**, to:

```
C:\Users\sureshr\Documents\Default Project\LabLens-cleanup-quarantine\
```

with their repository-relative paths preserved (e.g. `artifacts\qa\full-product-audit\error.log` → `…\LabLens-cleanup-quarantine\artifacts\qa\full-product-audit\error.log`).

`artifacts/pre-submission/CLEANUP_MANIFEST.json` is the authoritative record. Each entry contains:

- `original_absolute` / `original_relative` — where the file lived in the project before quarantine
- `quarantine_absolute` / `quarantine_relative` — where it is now
- `sha256` — checksum recorded at move time
- `size_bytes`, `modified_utc` — byte size (also from before the move) and last-modified UTC
- `reason` — why it was moved
- `references_found` — what the dependency audit found (usually "None found")

A full verification pass after the move re-hashed **515/515 files** with **0 mismatches**.

---

## Restore everything (dry run first)

```powershell
$manifest = Get-Content .\artifacts\pre-submission\CLEANUP_MANIFEST.json -Raw | ConvertFrom-Json
foreach ($e in $manifest.entries) {
  if ((Get-FileHash -LiteralPath $e.quarantine_absolute -Algorithm SHA256).Hash -ne $e.sha256) {
    "MISMATCH $($e.original_relative)"   # fix hash first — do NOT restore blindly
  }
}
# restore:
foreach ($e in $manifest.entries) {
  $dst = Join-Path (Resolve-Path .).Path $e.original_relative
  New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
  if (Test-Path $dst) { "SKIP (already exists, not overwriting): $dst"; continue }
  Move-Item -LiteralPath $e.quarantine_absolute -Destination $dst
}
```

## Restore one file

```powershell
$manifest = Get-Content .\artifacts\pre-submission\CLEANUP_MANIFEST.json -Raw | ConvertFrom-Json
$e = $manifest.entries | Where-Object { $_.original_relative -eq '<original-\relative\path.ext>' }
$dst = Join-Path (Resolve-Path .).Path $e.original_relative
New-Item -ItemType Directory -Force (Split-Path $dst -Parent) | Out-Null
Move-Item -LiteralPath $e.quarantine_absolute -Destination $dst
```

## Safety rules already applied (don't undo blindly)

1. The quarantine directory is **outside** the repo. Never point a recursive delete at the repo root to "clean up" — everything outside `docs/development/` that looked ephemeral was moved, not deleted. The only permanent removals were the seven `.pytest_cache` / `__pycache__` directories cataloged in the manifest (`deleted_cache_dirs`).
2. Restoring files that were moved because of a **bug fix** (the `accuracy_evaluator.py` move into `backend/tests/`, the four `EVALUATOR_DIR` edits, the three benchmark-runner path edits and four markdown reference fixes) will reintroduce the pre-cleanup breakage. Restore out of quarantine only what you specifically need, keeping the fixes in place.
3. `backend/data/` (real user data) was never touched — it is not in the manifest; there is nothing to restore from quarantine.
4. `dist/` was regenerated; it is not in the manifest, it is git-ignored, and `npm run build` reproduces it.

## Expected module resolution

- `backend/tests/accuracy_evaluator.py` must stay in `backend/tests/` (or tests must repoint `EVALUATOR_DIR`).
- QA harnesses in `docs/development/qa/full-product-audit/` expect the repo root four levels up; run them from the repo root with `node docs\development\qa\full-product-audit\<harness>.cjs` against an **isolated** `LABLENS_DATA_DIR` on a port outside the dev stack (they upload synthetic reports and **must never** touch the dev database).
