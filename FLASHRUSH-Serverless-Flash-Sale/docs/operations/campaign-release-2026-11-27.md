# Campaign release - 2026-11-27

Applied after explicit user authorization. Verified at 20:27:38 UTC+7.

- Account: `303278700480`; region: `us-east-1`; CLI profile: `flashrush`.
- Stack: `flashrush-lab`; table: `flashrush-lab-campaigns`.
- API: `https://7h0r2fxsha.execute-api.us-east-1.amazonaws.com`.
- Source plan: `scripts/seed/campaigns-2026.json`, 20 stable `shop-*` IDs from commit `491e741`.

## Backend prerequisite

Downloaded and backed up the actual deployed `flashrush-lab-api` archive. Its campaign selector still sorted ended windows ahead of future windows. Updated only `app.py:public_product` inside that existing archive, preserving all other module bytes and all other Python AST behavior. The full local integration-hardening changes were not deployed by this release.

The candidate selector passed 230 local boundary comparisons against the real catalog and combined campaign plan. All seven seed regression tests passed. Lambda update used RevisionId concurrency protection, reached Successful, and the deployed CodeSha256 matched the candidate. Public products/campaigns smoke returned HTTP 200 before data application.

Deployed code SHA256 (base64): `5yMTjJKK/Wrw+/zPNXQNkmEfbRYdcFgkx11uVGwYZ0Y=`.

## Data application

Executed from repository root:

```powershell
.venv/Scripts/python -B FLASHRUSH-Serverless-Flash-Sale/scripts/seed/campaigns.py --apply --profile flashrush --account 303278700480 --region us-east-1 --stack flashrush-lab --report FLASHRUSH-Serverless-Flash-Sale/.build/campaign-release-20261127T132527Z/seed-applied.json
```

The existing guarded seed tool validated fresh stack outputs/catalog, then inserted all 20 records in one DynamoDB transaction, with absent-ID conditions and product-existence checks. It did not update/delete existing campaigns or write products/orders/vouchers.

## Verified results

| Check | Result |
| --- | --- |
| Campaign count before / after | 5 / 25 |
| Planned IDs in DynamoDB and public API | 20 / 20 |
| Stored supported fields match plan | PASS |
| All five previous records unchanged | PASS, compared full typed backup |
| Product catalog, prices and stock unchanged | PASS, compared full typed backup |
| New campaign status | All 20 UPCOMING |
| Public product selection | 22 matching campaign-window checks passed |
| Fresh repeat preview | 0 additions, 20 unchanged, no errors |

The first new campaign starts at 08:00 UTC+7 on 2026-12-05. New campaigns should appear under the storefront's upcoming-sale filter, not as live campaigns today. No schedule was moved to manufacture an active sale.

Backups and evidence are local under `.build/campaign-release-20261127T132527Z/`: original/candidate Lambda archives, typed campaign/product snapshots, inspection/preparation metadata, deployment report, applied seed report and final verification JSON. No rollback was needed. Retain these before future deployment. Do not restore an old Lambda archive over later unrelated changes without reviewing the current revision; no automatic campaign deletion is prescribed.

This evidence establishes this campaign release only. It does not establish full application AWS end-to-end or production readiness. No order placement, stock mutation, infrastructure replacement, full frontend release, commit or push was performed.
