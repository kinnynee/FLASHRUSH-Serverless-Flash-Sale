> Deployment update 2026-11-20: AWS authenticated as AdminUser in account 303278700480/us-east-1. Stack flashrush-lab UPDATE_COMPLETE; frontend published. HTTP smoke passed 12 checks (homepage and asset hashes, SPA route, missing-asset denial, catalog, isolated order acceptance/confirmation, stock and token access). See tests/evidence/deployment-12a6a83bad32.json and corresponding manifest. No full load/DLQ/redrive/cleanup rehearsal or browser visual QA performed. No commit/push. Historical source-only notes below describe the preceding phase.

# Remediation status — 2026-11-20

Source changes only. No deployment, publish, cleanup, Jira update, commit or push performed. AWS STS was retried and failed with expired session; current resources remain unverified. Audit verdict remains CONDITIONAL GO.

| Finding | Implemented locally | Remaining acceptance |
|---|---|---|
| F01 | Shared CLI config, account guard, existing stack ownership/region/status guard; all four entrypoints | AWS validation. Stack intentionally limited to flashrush-lab because physical names are fixed |
| F02 | Age/attempt/eligibility report, dry-run, overdue exit 2, bounded resend, operator permissions documented | Approved business threshold, deployed operator role, live recovery/escalation rehearsal |
| F03 | Separate stock=2 duplicate fixture; wait for terminal-noop consumption log, timeout fails | Deploy worker logging and run revised verifier |
| F04 | Tests: concurrent same key, active lease, send limit, ACK accepted then timeout, transaction conflict/retry, requestId | Actual retry→DLQ/redrive, throttling fault injection, comprehensive distributed lease races |
| F05 | Prepared deploy/publish manifests, verify manifest, artifact/template/file hashes, public order snapshots | Archive final deployed state, runtime versions and raw live evidence with run manifest; prepared is not completion |
| F06 | Ownership-aware cleanup and rollback runbook | Live rehearsal and delayed billing verification |
| F07 | Source-derived Mermaid architecture baseline, explicitly Pending approval | Architect approval and approved visual artifact |
| F08 | No implementation | Workshop host/theme decision, Hugo scaffold and bilingual content remain |
| F09 | No fabricated evidence | Genuine AWS/browser/cleanup screenshots after live access |
| F10 | Root README paths/cwd fixed; frontend README and handover corrected | Full docs link sweep and walkthrough |
| F11 | Quantity=1 in HTTP checkout; loaded catalog categories/deadlines; runtime response validation | Browser walkthrough and visual QA; illustration schedules remain labelled demonstration |
| F12 | Build before seed; assets before index; SPA route Function replaces broad 403/404 success fallback; rollback runbook | Live upload/rollback rehearsal; index-last is not a multi-object atomic deployment |
| F13 | Pinned local Python environment, offline Windows CI, backend/frontend/config checks | Hosted CI run; runtime SDK remains Lambda-provided, not bundled/pinned |
| F14 | No broad formatting/scaffold deletion | Optional separate maintenance scope |

## Local verification

- Backend unittest/Moto: **9/9 pass**.
- Configuration/recovery/template unittest: **4/4 pass**.
- Frontend Vitest: **31/31 pass**, six files.
- Production build: mock mode passed before final tests; HTTP mode passed with `https://example.invalid` (offline build only).
- Generated CloudFront JavaScript executed with Node: application-route rewrites and missing-asset preservation assertions passed.
- `git diff --check`: passed.
- Generated template refreshed from generator. Its backend code key still references the historical artifact; actual deploy rebuilds and replaces the key. Do not manually deploy the checked-in template as evidence that new backend code is already uploaded.
- CI configuration created, not executed on GitHub. No claim of current AWS, browser, cost or cleanup validation.

## Resume live verification

Authenticate the existing AWS profile using `aws login --profile dropit-admin`. Verify STS/account/region. Review source/template changes and authorize a concrete deployment/testing scope before invoking mutation scripts. Preserve the historical 18 November evidence; new runs must generate new evidence and final deployment provenance.
