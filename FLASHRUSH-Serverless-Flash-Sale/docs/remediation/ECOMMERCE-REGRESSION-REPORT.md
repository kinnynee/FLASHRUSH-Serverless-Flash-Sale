# Integration regression report

Date: 2026-11-27, Asia/Bangkok. Local Windows workspace, Python 3.12 in the repository `.venv`, installed locked backend dependencies/Moto, Node/npm and Vitest/Vite/TypeScript. The current local workspace, including uncommitted voucher work, was the baseline.

## Final verification

All commands below ran from the nested application directory. `python` denotes `..\.venv\Scripts\python.exe`; npm used `npm.cmd` on Windows. Outputs and actual subprocess exit codes are saved in `.build/hardening-evidence/results.json` and per-command text logs. Final executions, not old totals, are reported here.

| Area | Command | Passed | Failed | Skipped | Exit |
| --- | --- | ---: | ---: | ---: | ---: |
| Backend unit/Moto | `python -m unittest discover -s backend -p 'test_*.py'` | 76 | 0 | 0 | 0 |
| Deployment/configuration/rollback mocks | `python -m unittest discover -s scripts/deploy -p 'test_*.py'` | 20 | 0 | 0 | 0 |
| Operations/Moto | `python -m unittest discover -s scripts/ops -p 'test_*.py'` | 5 | 0 | 0 | 0 |
| Frontend Vitest | `npm test --prefix frontend` | 80 | 0 | 0 | 0 |
| ESLint | `npm run lint --prefix frontend` | Check passed | 0 | n/a | 0 |
| Mock build | `npm run build --prefix frontend`, VITE_ORDER_MODE=mock | Build passed | 0 | n/a | 0 |
| HTTP build | `npm run build --prefix frontend`, VITE_ORDER_MODE=http | Build passed | 0 | n/a | 0 |

Builds used explicit offline configuration: API `https://example.invalid`, public client `offlineclient`, region `us-east-1`, demo error false. They do not establish real environment compatibility. Production bundles were compiled locally; none were uploaded.

The backend total includes all 15 existing `test_vouchers.py` regression methods, unchanged from the protected baseline.

Additional checks: all template JSON parsed; committed full-template content equals generator output with the same artifact bucket/key; workflow YAML parsed; Git whitespace check passed. AWS CloudFormation ValidateTemplate and a deployed changeset were NOT_EXECUTED.

The incomplete target example was rejected locally with `INCOMPLETE_CONFIGURATION`, status NOT_READY and actual Python exit code 2 before creating any AWS session. This is an expected negative test, not a successful live preflight.

## Local browser integration

Command: `node .build/hardening_e2e.cjs` against a dedicated localhost Moto HTTP fixture (`8878`) and Vite (`5175`), using headless Chromium through Playwright. This temporary harness adapted the existing local fixture without overwriting it. It used real application React services, Lambda API and Worker functions with Moto DynamoDB/SQS/Cognito. Gateway claims were emulated after Moto GetUser validation; this does not test AWS JWT signature enforcement.

Final result: 8 integration checkpoints passed, 0 failed, 0 browser page errors:

1. Registration, local email confirmation and login.
2. Delivery-address persistence and saving a dedicated LOCAL10 voucher.
3. HAUMON rejected in the cart interface.
4. Two-product quote/checkout through SQS and the atomic Worker; both children CONFIRMED.
5. Indexed history, purchase snapshot and mobile order detail; no horizontal overflow at cart widths 1440, 768 and 390.
6. A customer session cannot enter staff administration.
7. Owner JWT opens the current voucher administration and sees the stored voucher.
8. Switching owner to warehouse denies voucher management and permits inventory access.

Evidence: `.build/hardening-e2e-result.json` and `.build/hardening-order-mobile.png`; the screenshot was visually inspected. Intermediate browser harness attempts failed due to broad selectors or reading before asynchronous navigation/data load. Those selectors/waits were corrected; the final recorded run passed. Temporary harnesses/servers are removed/stopped after verification; existing user fixture files are retained.

## Baseline and regression development

Fresh pre-edit baseline: backend 68 tests, deployment 9, operations 2, frontend 72; frontend build passed. Baseline evidence is in `.build/integration-hardening-baseline`. PowerShell Tee emitted NativeCommandError wrappers around unittest stderr in those baseline logs even though unittest ended OK. Final results use subprocess capture and return codes instead of that pipeline.

The first targeted hardening run reproduced seven assertion/subtest failures and two errors across five methods before implementation. Subsequent intermediate runs exposed old admin-key fixtures, missing JWT metadata in mocks, nullable legacy-address TypeScript errors and test import ordering. These were corrected; no known failing tests are omitted from the final suite.

## Required matrix

PASS below means the named local evidence passed. Live AWS status for every row remains NOT_VERIFIED.

| ID | Scenario | Local evidence/status |
| --- | --- | --- |
| TC-01 | Missing Cognito configuration | PASS: target config and release binding reject missing client/config |
| TC-02 | Customer admin access | PASS: backend role matrix; browser customer/staff separation |
| TC-03 | Staff permitted operations | PASS: role tests; browser owner vouchers and warehouse inventory |
| TC-04 | All voucher administration methods | PASS: backend GET/POST/PATCH role matrix and existing voucher mutation tests |
| TC-05 | HAUMON checkout | PASS: existing voucher tests and browser cart rejection |
| TC-06 | Valid current voucher | PASS: existing Moto tests and LOCAL10 browser checkout |
| TC-07 | Account switching | PASS: late login/refresh/request generation tests; browser role switch |
| TC-08 | Wallet ownership | PASS: existing voucher wallet tests; customer subject/storage isolation |
| TC-09 | Authenticated history | PASS: group checkout tests, new legacy atomic-index test, browser history |
| TC-10 | Cross-account order access | PASS: legacy/group ownership tests and subject-bound cursors |
| TC-11 | Immutable historical prices | PASS: stored snapshot after product deletion; frontend no catalog request; missing prices remain null |
| TC-12 | Multi-item atomic processing | PASS: existing competition/failure tests and two-item browser confirmation |
| TC-13 | Duplicate SQS delivery | PASS: existing Worker and voucher retry/idempotency tests |
| TC-14 | CloudFormation recovery | PASS: existing BusinessTable resolver test retained and expanded |
| TC-15 | Manual recovery dependencies | PASS: inventory requirement, schema/account/region/tag guards; live manual run NOT_VERIFIED |
| TC-16 | Repeated recovery | PASS: one group transaction across child orders; repeat is no-op; redemption once |
| TC-17 | Wrong environment | PASS: ARN/account/region/tag and mixed-target rejection; artifact target hash |
| TC-18 | CloudFront deep links | PASS: generated SPA rewrite tests/local SPA navigation; actual CloudFront NOT_VERIFIED |
| TC-19 | Voucher after JWT changes | PASS: unchanged voucher suite and owner browser voucher API |
| TC-20 | Missing infrastructure | PASS: mocked preflight denies absent queue mapping, IAM dependencies and routes |
| TC-21 | Retirement check preserved | PASS: byte-identical engine and HAUMON tests |
| TC-22 | Incomplete manual resources | PASS: explicit INCOMPLETE_CONFIGURATION; no namespace guessing |
| TC-23 | Changed quote needs confirmation | PASS: existing price/discount/expectedTotal tests; Worker fails entire changed group without stock mutation |
| TC-24 | Expired authentication | PASS: backend token metadata, staff expiry, customer refresh/logout/race tests |
| TC-25 | Legacy compatibility | PASS: schema 1.0 processing, private access, dry-run/idempotent backfill, 27-order pagination |

## Limits and readiness

Overall deployment readiness: **NOT_READY**. Source/tests/builds are locally verified, but no explicit release inventory, current AWS account/region validation or dedicated staging identities were supplied. This is not READY_FOR_STAGING, AWS_VERIFIED or production readiness.

Real AWS checks NOT_VERIFIED: Gateway JWT issuer/signature/expiry, Cognito email delivery and revocation, effective IAM/SCP/resource policies, deployed route integration and CORS, real CloudFront rewrites, production-scale transaction contention, SQS visibility/retries/DLQ, operational alerts/SNS delivery, actual backfill and actual rollback. Basic smoke deliberately does not create a purchase; a separately authorized staging E2E must test that final path.

Local no-overselling, no-double-deduction and no-double-redemption assertions passed in Moto. Moto does not prove AWS concurrency behavior under load. Historical missing purchase data cannot be reconstructed; the UI reports it as missing. Migration/recovery must be reviewed and executed on the selected target after backups.
