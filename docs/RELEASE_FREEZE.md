# Gravitas v1 — Release Freeze

`release/v1` is the integration and QA branch for the first cohesive Gravitas release.

From the moment the release branch is cut:

- No new product features.
- Accept only release blockers, regressions, accessibility fixes, identity/package metadata, and polish required by the v1 QA checklist.
- `Send for Review` remains explicitly out of scope for v1.
- Every fix lands on `release/v1` and is retested against `docs/release-v1-checklist.md`.
- Do not merge into `main` until the exact release commit has passed the manual smoke test and build gates.
- Once approved, merge/promote the exact tested release commit to `main`; do not rebuild the release by cherry-picking a different set of commits.

The release loop to protect is:

**Write → Read & Review → Audit & Resolve → Export → Relaunch**
