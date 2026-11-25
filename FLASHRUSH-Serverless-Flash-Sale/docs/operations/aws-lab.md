# FLASHRUSH AWS lab

## Current deployment - 2026-11-25

- Account `303278700480`, profile `flashrush` (AWS CLI console login), region `us-east-1`, stack `flashrush-lab`.
- Website: https://d1jcrzj4650vey.cloudfront.net
- API: https://7h0r2fxsha.execute-api.us-east-1.amazonaws.com
- Pass `--profile flashrush --region us-east-1 --account 303278700480 --stack flashrush-lab` to deployment, publication, verification and reconciliation commands. Older profile names and URLs below are historical.
- Both Lambda handlers require `CAMPAIGNS_TABLE` because they import the same module. Admin campaign mutation routes require AWS IAM signed requests; the browser admin form does not yet implement authentication/signing.
- Publication seeds a seven-day `flashrush-demo` campaign and missing product start times, preserving existing stock and campaign records. Frontend local configuration uses the live API.
- Live verification [d5e81c1c](../../tests/evidence/aws-d5e81c1c.json) passed: 100 unique requests, 29 accepted (10 CONFIRMED, 19 OUT_OF_STOCK), 71 rejected with SALE_SOLD_OUT, final stock 0. Duplicate delivery did not decrement stock again; token and replay checks passed. This reflects the current early sold-out rejection behavior, not the historical 100-accepted contract.
- Browser checkout confirmed Sony order `ord_89a1997a4dbe495b104263123caa6a31`. Website and deep link returned HTTP 200, unsigned admin request returned 403, localhost CORS passed. Reconciliation found zero pending orders; DLQ visible/in-flight counts were zero.
- Local checks passed: 33 frontend tests, 15 backend tests, six deployment guard tests, production build. Python dependencies were installed from `requirements-dev.txt` (boto3/botocore 1.44.11, moto 5.2.6); this run did not use the older lock file.
- Test fixtures and orders remain in the lab for inspection. Earlier failed-run evidence is retained. SNS topic and alarms exist, but email subscription/delivery was not configured in this deployment. Dashboard metrics remain simulated. Resources remain active and can incur AWS charges.

Implementation follows the v1.1 draft as a lab baseline. This deployment does not record team ADR approval. No payment or account authentication is implemented. The order token is an anonymous bearer capability. Admin and Monitoring dashboards retain simulated data and have no privileged API.

## Environment

Profile `dropit-admin`; Region `us-east-1`; CloudFormation stack `flashrush-lab`; application resource prefix `flashrush-lab-`. Existing DropIt resources are outside this stack. Lambda account concurrency was 10 at deployment; the SQS mapping uses maximum concurrency 5 without reserved concurrency. API stage throttles at 5 requests/second, burst 10. This may produce 429 responses; clients retain their idempotency keys.

Nine application services: S3, CloudFront, API Gateway, Lambda, SQS, DynamoDB, CloudWatch, SNS, IAM. CloudFormation is deployment tooling. An additional private S3 bucket holds Lambda artifacts. Logs retain seven days; three CloudWatch alarms cover DLQ depth, queue age and Worker invocation errors. Partial batch failures are retried through SQS and do not increment Lambda Errors automatically; queue age and DLQ alarms cover that path. No automatic pending-order scheduler is installed.

## Reproduce

Run from the inner application directory containing `frontend` and `backend`, preserving the repository's existing nested structure:

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements-dev.txt
.venv/Scripts/python -m unittest discover -s backend -p 'test_*.py' -v
.venv/Scripts/python scripts/deploy/deploy.py
aws cloudformation wait stack-create-complete --stack-name flashrush-lab --profile dropit-admin --region us-east-1
```

Deployment validates CloudFormation, saves the change set in ignored `.build/change-set.json`, then executes it. For updates, wait with `stack-update-complete`. An unchanged template can produce an empty change set; it requires no deployment. `.build/outputs.json` is written by publish/verification. No credentials are written to source files.

Catalog export and website publication:

```powershell
Set-Location frontend
npm ci
node -e "const fs=require('fs'),ts=require('typescript'),vm=require('vm'); const out=ts.transpileModule(fs.readFileSync('src/mocks/products.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText; const ctx={exports:{},Date}; vm.runInNewContext(out,ctx); fs.writeFileSync('../.build/catalog.json',JSON.stringify(ctx.exports.products));"
npm test
Set-Location ..
.venv/Scripts/python scripts/deploy/publish.py
.venv/Scripts/python scripts/deploy/verify.py
```

Publish seeds only missing catalog records; it never resets stock. Seeded catalog prices and descriptions are demonstration merchandise data, but API stock and order statuses are persisted on AWS. Sale deadlines are seeded seven days ahead. The live verifier creates its own unique SKU with stock 10, submits 100 unique intents using bounded concurrency and same-key HTTP retries, audits DynamoDB, checks token access and payload conflicts, then replays a confirmed message. Evidence files contain counts and order IDs, never bearer keys. HTTP attempt counts distinguish submitted unique requests, accepted orders, retries and terminal outcomes. This is a bounded lab test, not a peak throughput benchmark.

## API

- `GET /products`: `{items: Product[]}`. Product includes frontend display fields plus `priceVnd`.
- `GET /products/{productId}`: product, or 404.
- `POST /orders`: `Idempotency-Key` canonical lowercase UUIDv4; body `{productId,quantity:1}`. 202 only after SQS ACK (or prior recorded ACK); 200 for terminal replay; 409 for payload conflict; 503 for uncertain enqueue. Retry with the same key and payload.
- `GET /orders/{orderId}`: `X-Order-Token` equals original key; 404 for missing/invalid token or unknown order.

Only quantity 1 is supported. Frontend HTTP mode caps the selector at 1. Raw keys are neither logged nor persisted on AWS. Orders retain hashes until explicit lab cleanup; no TTL silently resets idempotency.

## Recovery

```powershell
.venv/Scripts/python scripts/ops/reconcile_pending.py
.venv/Scripts/python scripts/ops/reconcile_pending.py --resend
```

Inspect reports after every test/demo. Resend only acquires expired unsent leases, maximum three sends per order. `SENT` orders need queue/log investigation; do not resend blindly. A send timeout records `UNKNOWN` and retains the lease for 30 seconds. Worker reads the authoritative order, uses a conditional transaction for stock and confirmation, separately verifies out-of-stock atomically. Transient failures return partial batch failures; SQS retries after the 90-second visibility timeout, then moves messages to DLQ after five receives. DLQ does not automatically set Orders to FAILED. Investigate missing/malformed messages before a controlled redrive. Do not overwrite terminal states or reset stock during verification.

SNS email subscription requires recipient confirmation. Missing confirmation means email delivery is not active. Do not claim email delivery was tested solely because subscription creation succeeded.

Deployment evidence on 2026-11-18: stack `UPDATE_COMPLETE`; website `https://d3iqr833zkimb.cloudfront.net`; API `https://6bxtg6foxl.execute-api.us-east-1.amazonaws.com`. The email subscription was confirmed. A controlled `set-alarm-state` notification test successfully executed the SNS action; the alarm was restored to OK. Inbox receipt was not independently inspected. All three alarms ended OK, DLQ was empty, reconciliation reported zero pending orders. Live test `3bf9033f` accepted 100 unique orders, reached 10 CONFIRMED / 90 OUT_OF_STOCK, final stock 0; 13 HTTP 429 attempts were retried with the original keys. Browser smoke confirmed a separate Sony order; DynamoDB stock changed from 3 to 2. Frontend tests: 26 passed; backend tests: 4 passed. See `tests/evidence` for records.

## Costs and cleanup

The design target below USD 5 remains unverified; it is not a spending cap. Resources remain active after this task. CloudWatch alarms/logs, SQS polling and CloudFront traffic can accrue charges. Existing account budgets do not enforce the project target. Inventory is available through `aws cloudformation list-stack-resources`; artifacts bucket is `flashrush-lab-artifacts-<account>-us-east-1` outside the stack.

Cleanup only the named FLASHRUSH stack: stop test traffic; disable its SQS event source mapping; empty its website S3 bucket; delete stack `flashrush-lab` and wait for completion (CloudFront deletion takes time). Empty/delete the separately created artifacts bucket only after confirming no FLASHRUSH deployment still references it. Preserve evidence first. Do not delete DropIt resources or profiles. Check inventory and billing after AWS refreshes costs; no immediate-zero-cost claim.

## Official references

- [DynamoDB transaction actions and same-item restriction](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)
- [SQS event source mapping, timeout and IAM configuration](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html)
- [Partial batch response and retry handling](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html)
- [CloudFormation Lambda properties](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-lambda-function.html)


## Audit remediation — 2026-11-20 (source only)

All four scripts accept the same --profile, --region, --account and --stack arguments. Default account is 303278700480. Only flashrush-lab is currently supported because physical names are fixed. STS identity and existing stack Project tag/region/account are checked before mutation. Missing or unready stack aborts publish/verify/recovery. Use the same flags on every command.

Recovery defaults to a 300-second operational threshold (not an approved business SLA). It reports age, attempts, eligibility, dryRun and overdueUnresolved. Exit 2 means overdue PENDING remains, even after successful resend; investigate and rerun after worker completion. Missing timestamps require investigation. Manual checks are required after every demo and regularly while traffic is active; there is no scheduler. Operator needs scoped sts:GetCallerIdentity, cloudformation:DescribeStacks, dynamodb:Scan/GetItem on Orders; resend additionally needs dynamodb:UpdateItem on Orders and sqs:SendMessage on the main queue. Prefer a dedicated operator role; deployed operator IAM is not verified.

Publish builds before catalog seeding and uploads index last. Retain previous dist and manifest for rollback. CloudFront template uses a viewer-request Function to rewrite extensionless application routes; missing assets retain origin errors. This template change has not been deployed. Duplicate verifier now uses a separate stock=2 fixture and waits for worker terminal-noop logs; timeout fails instead of assuming a five-second sleep proves consumption. Existing 18 November evidence remains historical and does not validate the revised verifier.

Run local checks with backend/requirements-lock.txt (Python 3.12). Runtime boto3 is still Lambda-provided; its exact deployed version must be recorded during live validation. Manifests under .build/manifests record commit/dirty state, target and operation details. Deploy manifest is prepared-state only; capture final stack state separately. Archive manifests with test evidence after a run. CI is offline and has no AWS credentials.

See [architecture draft](../architecture/baseline.md) and [cleanup/rollback runbook](cleanup-runbook.md). Architecture approval, live fault injection/DLQ/redrive, cleanup rehearsal, screenshots and Workshop host remain outstanding; do not report them as completed.
