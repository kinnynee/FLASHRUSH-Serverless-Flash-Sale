# FLASHRUSH AWS lab

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
