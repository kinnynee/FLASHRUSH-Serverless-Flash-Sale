# Workshop documentation impact

Repository inspection found `workshop/5-Workshop/_index.md` and `_index.vi.md` as empty placeholders. There are no populated numbered chapters to truthfully cite. Populate the following sections in the workshop, using the existing operations guides as source material, after staging verification.

| Proposed section | Required correction | Existing material to reconcile |
| --- | --- | --- |
| Authentication | Shared Cognito pool/client, separate scoped browser sessions, expiry/logout/account switch, real verification delivery | docs/operations/customer-commerce.md; customer-inventory-users.md |
| IAM and staff roles | Runtime execution policies versus owner/manager/warehouse/support; no browser AWS credentials/admin-key bypass | docs/operations/customer-inventory-users.md; aws-lab.md |
| API Gateway | JWT issuer/audience/access scope for every customer/admin method; explicit operator SigV4 compatibility only | docs/operations/aws-lab.md |
| DynamoDB customer data | userId/recordId, immutable snapshots, indexed references and reviewed legacy backfill | docs/operations/customer-commerce.md |
| Checkout | Server quote/reconfirmation, grouped atomic processing, PENDING versus terminal status | docs/operations/cart-voucher-checkout.md |
| Voucher wallet | Preserve saved ownership, retirement of HAUMON, current managed codes, no reservation on save, one redemption/customer/code | docs/operations/vouchers.md |
| Worker | Legacy schema 1.0 versus group schema 2.0, conditional stock, duplicate delivery | docs/requirements/system-overview.md |
| Recovery | Stack outputs including BusinessTable; validated manual inventory; grouped attempts, error reports and nonzero unresolved exit | docs/operations/aws-lab.md; remediation deployment runbook |
| CI/CD | Dispatch target/environment, public Cognito build config, fail-closed preflight, artifact binding, rollback all overwritten keys | docs/operations/cicd.md |
| Testing | Unit/Moto/frontend/local browser evidence versus real AWS evidence; smoke levels cannot imply full E2E | remediation regression report |
| Architecture | Nine-service core plus existing Cognito = ten application services | docs/architecture/baseline.md; NINE-SERVICE-ARCHITECTURE-IMPACT.md |

Historical operations pages contain deployment-specific URLs, IAM admin instructions and old test totals. Treat those as dated historical records, not instructions for this release. This task adds the current remediation runbook; it does not rewrite historical deployed evidence or fabricate new screenshots/costs/AWS outcomes. Populate workshop deployment screenshots only after running authorized staging validation. Local Moto screenshots must retain their local-emulator label.
