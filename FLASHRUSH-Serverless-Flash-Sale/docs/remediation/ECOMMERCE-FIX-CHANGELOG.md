# Integration hardening changelog

Date: 2026-11-27 (Asia/Bangkok). Base commit: `96be4e1`, local `main`.
Scope: local source, tests, templates and documentation. No AWS deployment, commit or push.
The authoritative baseline includes the user's uncommitted voucher wallet work.

## Findings

| Finding | Initial status | Root cause | Change | Final source status |
| --- | --- | --- | --- | --- |
| Release integration | OPEN | Push-to-main release used a fixed manual API/account/site; missing Cognito build inputs; homepage checks implied success | Explicit workflow dispatch target/environment, inventory validation, read-only AWS preflight, bound build manifest, separate smoke levels, complete overwritten-asset rollback | FIXED locally; deployment BLOCKED pending inventory and AWS validation |
| Staff JWT/RBAC | OPEN | Browser bearer access tokens met IAM/public Gateway routes; browser admin-key bypass; sessions lacked expiry/isolation | All browser admin methods and protected auth routes use shared Cognito JWT/scopes; live Cognito identity/groups; role guards; expiry/logout/switch generation checks; browser key removed | FIXED locally; published Gateway behavior NOT_VERIFIED |
| Ownership/history | OPEN | Legacy authenticated orders stored customerId without an indexed customer reference | Atomic order/reference creation; access accepts existing customerId or ownerId; guest lookup rejects owned records; reviewed dry-run backfill script | FIXED locally; historical AWS backfill NOT_EXECUTED |
| Purchase snapshots | OPEN | Frontend/admin reconstructed historical information from current product data | Persist new order snapshots and use stored fields everywhere; unknown prices remain null and show a missing-data message; unknown revenue count displayed | FIXED locally |
| Recovery | PARTIALLY_FIXED | Baseline already resolved BusinessTable from CloudFormation; manual mode guessed names; grouped children repeated recovery; exceptions aborted reporting | Preserve stack output fix; explicit validated inventory for manual; clear runtime environment; deduplicate checkout groups; per-group errors and terminal status reporting | FIXED locally; baseline CloudFormation fix ALREADY_FIXED |

## Compatibility

- `/me/checkouts` remains the canonical signed-in cart flow. Guest `/orders` still uses the order token. Authenticated legacy `/orders` returns a `/me/orders/{id}` status URL.
- Legacy schema 1.0 retains `customerId`; adding `ownerId` would cause the existing Worker to reject these pending orders. Group checkout schema 2.0 remains unchanged.
- No historical prices, identities, addresses or checkout groups are inferred from today's product catalog or email. Missing prices remain unknown; administrative revenue excludes them and exposes the excluded count.
- Backfill writes only indexed references and condition-checks the source owner/time. Existing source orders and their Worker schema remain untouched. Guest records are skipped; conflicting ownership is reported.
- Browser sessions use separate customer/staff storage, scoped to the target. Existing unscoped sessions require login again. Stable Cognito subjects and persisted voucher wallets are unchanged.
- Staff access tokens expire locally and require login again; staff refresh tokens are not stored. Backend roles are fetched from Cognito on each authenticated administrative request.
- Legacy admin-key compatibility requires both a trusted Gateway IAM authorizer context and `ALLOW_LEGACY_ADMIN_IAM=true`. No browser route enables it and no new operator endpoint is provisioned. Operators need a separately reviewed SigV4 integration; putting IAM credentials or an admin key into React is unsupported.
- Release now updates only fully provisioned, validated resources. It does not provision missing manual customer infrastructure or automatically switch to the lab.

## Verification and evidence

See `ECOMMERCE-REGRESSION-REPORT.md` for commands, counts and limits, and `VOUCHER-BASELINE-PRESERVATION.md` for before/after hashes.
Initial regression tests reproduced invalid staff-token metadata acceptance, browser admin-key authorization and missing legacy references/snapshots. Existing endpoint fixtures were then migrated from admin-key authentication to a verified-owner test identity, while separate tests exercise actual Cognito validation boundaries.

Generated template changes preserve existing Lambda artifact bucket/key and customer/voucher routes. New environment ownership tags support target isolation. CloudFormation schema/deployment validation remains an AWS step.

Exact repository-relative changed paths and separation from preexisting work are in `SOURCE-CHANGE-INVENTORY.md`.

## Remaining deployment risks

Overall release readiness is **NOT_READY** until an explicit target inventory and staging identities are supplied and live preflight passes. Local source checks are verified; AWS end-to-end status is **NOT_VERIFIED**.
IAM simulation is a prerequisite, not proof of effective permission under all SCP/resource policies. Real API Gateway JWT verification, Cognito delivery/revocation, CloudFront routing, concurrent DynamoDB transactions, queue retries and rollback must be exercised on the selected staging target.
