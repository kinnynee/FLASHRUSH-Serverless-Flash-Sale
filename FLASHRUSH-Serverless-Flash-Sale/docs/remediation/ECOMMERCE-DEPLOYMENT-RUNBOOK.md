# Staging deployment runbook

No commands in this runbook were executed against AWS during remediation. Commands below assume the nested application directory and an activated Python environment. Replace placeholders with reviewed identifiers; never copy resources between targets.

## 1. Select and inventory the target

Deployment is currently **NOT_READY**. Historical documents mention both manual and lab environments; neither is selected for this release. No live account/region/resource inventory was validated.

Create a private local `target.json` using `target.example.json` as the field contract. Set `target` to exactly `manual` or `lab`, the 12-digit account, region, and every physical resource identifier. Set `nonProduction: true` only for a dedicated staging/workshop target. The example intentionally fails validation.

Required runtime resources: ProductsTable(productId), OrdersTable(orderId), CampaignsTable(campaignId), CustomersTable(userId/recordId), BusinessTable(id), QueueUrl. All DynamoDB keys are strings. Required release resources additionally include ApiId/ApiUrl, ApiFunction/WorkerFunction, UserPoolId/UserPoolClientId, AuthorizerId, WebsiteBucket, DistributionId/WebsiteUrl.

Manual mode does not infer `flashrush-manual-*` names. Missing resources produce `INCOMPLETE_CONFIGURATION`; provision them through a separate reviewed infrastructure change before using the updater. Never borrow lab tables or Cognito resources.

For lab inventory, read validated `flashrush-lab` stack outputs. The generated template now outputs ApiId, ApiFunction, WorkerFunction and AuthorizerId in addition to existing table, queue, Cognito and website outputs. UserPoolId/UserPoolClientId refer to the same pool/client as CustomerPoolId/CustomerClientId. Recovery without `--inventory` retains the existing validated stack-output resolver.

Tag release resources `Project=FLASHRUSH` and `Environment=manual|lab`. Preflight verifies table, queue, pool, Lambda, API, bucket and distribution ownership tags and ARNs. The lab template supplies these tags. Review ownership before adding missing manual tags; tags are not proof of provenance on their own.

## 2. Infrastructure prerequisites

1. Confirm account with STS, region, inventory, IAM role ownership and resource tags.
2. Apply reviewed infrastructure changes first. Do not replace/delete retained customer data or Cognito pools. The existing lab deploy script executes a changeset; it is not a dry-run command. Review its generated template and proposed resource changes before an authorized invocation.
3. Configure the existing Cognito public client with no secret, password/refresh auth flows and owner/manager/warehouse/support groups. Use matching pool issuer, client audience and `aws.cognito.signin.user.admin` scope on all `/me/*`, `/admin/*`, GET `/auth/me` and POST `/auth/logout` routes.
4. Set both Lambda environments: PRODUCTS_TABLE, ORDERS_TABLE, CAMPAIGNS_TABLE, CUSTOMERS_TABLE, BUSINESS_TABLE, QUEUE_URL, USER_POOL_ID, USER_POOL_CLIENT_ID, CUSTOMER_CLIENT_ID, CUSTOMER_ISSUER. Both handlers import shared modules.
5. Validate Lambda execution IAM actions, API invocation permission, enabled SQS mapping and partial-batch failure reporting. Runtime IAM still differs between API and Worker; do not give every role broad administrative permissions.
6. Deploy the SPA viewer-request rewrite including customer, cart, auth, staff and admin paths. Missing static assets must retain real errors. Match CloudFront's default origin to the inventoried S3 bucket. Validate API CORS origin, methods and headers.

Preflight uses read-only describe/list/get calls and IAM policy simulation. The operator/CI role needs those permissions, including `iam:SimulatePrincipalPolicy`. A denied validation call blocks release; it is not silently skipped.

```powershell
python scripts/ci/release_check.py --inventory target.json --profile YOUR_PROFILE --preflight --output .build/release/preflight.json
```

This checks the default HTTP API endpoint/stage; custom API domains and stage prefixes are currently unsupported and fail closed. Effective SCP/resource-policy permissions still need real smoke tests.

## 3. Build and artifact binding

Set only public frontend configuration from the SAME inventory:

```powershell
$target = Get-Content target.json | ConvertFrom-Json
$env:VITE_ORDER_MODE = 'http'
$env:VITE_API_BASE_URL = $target.resources.ApiUrl
$env:VITE_COGNITO_CLIENT_ID = $target.resources.UserPoolClientId
$env:VITE_COGNITO_REGION = $target.region
$env:VITE_DEMO_SERVICE_ERROR = 'false'
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
python scripts/ci/release_check.py --inventory target.json --bind frontend/dist
```

Never put AWS credentials, passwords, admin keys or privileged tokens in Vite variables or dotenv files. Binding rejects sensitive Vite environment variable names. Review local dotenv files before a release; clean CI checkout is the preferred release builder. The manifest binds the full inventory hash and all built asset hashes; the updater rejects altered files or a different target.

The GitHub workflow is dispatch-only. Select `target` and a reviewed GitHub `environment`. Configure environment variables FLASHRUSH_INVENTORY_JSON, FLASHRUSH_DEPLOY_ROLE_ARN, FLASHRUSH_REGION and FLASHRUSH_ACCOUNT_ID. Keep the OIDC role constrained to this repository/branch/environment. Configure protected environment approval if desired. Offline push/PR checks remain separate.

## 4. Update and smoke (requires separate authorization)

The historical filename `deploy_manual.py` now updates existing validated resources for either explicit target; it never provisions them. Without `--execute` it performs preflight only.

Provide dedicated nonproduction smoke identities through SMOKE_CUSTOMER_USERNAME/PASSWORD and SMOKE_STAFF_USERNAME/PASSWORD, preferably GitHub environment secrets. They are never put in the bundle or printed. Do not use real customer credentials.

```powershell
python scripts/ci/deploy_manual.py --inventory target.json --profile YOUR_PROFILE
# Only after deployment authorization:
python scripts/ci/deploy_manual.py --inventory target.json --profile YOUR_PROFILE --execute
python scripts/ci/release_check.py --inventory target.json --profile YOUR_PROFILE --smoke --output .build/release/smoke.json
```

Public smoke checks homepage, product JSON, customer/staff SPA deep links and anonymous admin denial. Customer smoke logs in and checks profile/cart/history/wallet and invalid checkout-quote/nonexistent-group boundaries without creating orders. Staff smoke checks identity, a permitted API and role-specific voucher access. Missing authenticated credentials remain NOT_VERIFIED and make release verification fail. Successful basic smoke is SMOKE_VERIFIED, not complete AWS end-to-end certification.

Then execute a dedicated staging browser purchase: register/confirm email, login, save address/voucher, reject HAUMON, select multiple products, quote/reconfirm, submit once/retry same key, consume SQS, verify terminal child orders, inventory/redemption once, price snapshot after catalog edits, history pagination and cross-account denial. Exercise all staff roles and expired/revoked/wrong-pool tokens. Record actual evidence; none is claimed here.

## 5. Historical index migration and pending recovery

Back up the affected tables and review migration candidates. The backfill scans orders for migration only; ordinary history reads remain indexed and paginated. It never invents owners from email or changes order prices/schema.

```powershell
python scripts/ops/backfill_order_history.py --inventory target.json --profile YOUR_PROFILE --output .build/backfill-dry-run.json
# Review candidates/errors and authorize data writes before adding --execute:
python scripts/ops/backfill_order_history.py --inventory target.json --profile YOUR_PROFILE --execute --output .build/backfill-applied.json
python scripts/ops/reconcile_pending.py --inventory target.json --profile YOUR_PROFILE --output .build/pending.json
# After explicit recovery authorization, choose ONE action:
python scripts/ops/reconcile_pending.py --inventory target.json --profile YOUR_PROFILE --recover --output .build/recovered.json
python scripts/ops/reconcile_pending.py --inventory target.json --profile YOUR_PROFILE --resend --output .build/resent.json
```

For stack mode pass `--stack flashrush-lab --account ACCOUNT --region REGION --profile PROFILE`, omitting inventory/namespace. BusinessTable and CustomersTable must exist in validated outputs. Manual `--namespace flashrush-manual` alone is rejected. Recovery groups by ownerId/checkoutId, processes each once, and leaves technical failures pending. A resend attempt is not confirmation. Exit 2 means overdue unresolved orders remain; inspect the JSON and rerun after fixing the cause. Do not manufacture FAILED status for transport/permission errors. Running recovery twice must not deduct stock or redeem vouchers twice.

## 6. Rollback

Before updates, the updater backs up both Lambda zip files and every S3 key it will overwrite, including non-index mutable assets, content metadata and a missing-key manifest. Backups/reports live in `.build/release` and CI artifacts (14-day retention). Retain this artifact before any manual cleanup.

On update/smoke failure it attempts both Lambda restores, restores old asset bytes/metadata, removes only newly introduced release keys, and invalidates CloudFront. It continues rollback after an individual error and records `failure.json.rollbackErrors`. Any rollback error requires operator repair; never report a clean rollback without inspection. Mock rollback tests verify file/code restoration, not real AWS consistency.

Infrastructure and data backfill are separate changes: this updater does not roll them back. Preserve retained tables and Cognito identities; never downgrade to browser admin-key authorization. Validate recovered deployment and historical data before reopening traffic.
