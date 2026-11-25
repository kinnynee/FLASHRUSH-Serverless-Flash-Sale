# FLASHRUSH backend

Python 3.12 Lambda API and SQS Worker are packaged together from `app.py`, with distinct handlers and least-privilege roles. Runtime uses Lambda's included boto3. Development dependencies are isolated in `.venv`.

API supports product catalog, flash-sale campaign listing/detail and admin campaign create/update, order intake and token-protected status. Orders are accepted only for products in an active campaign window and within its `maxQtyPerOrder`. A deterministic order ID and conditional Put enforce idempotency. An enqueue lease coordinates SQS sends, including uncertain timeout recovery. Worker confirms orders and decrements stock in a single conditional DynamoDB transaction (`stock >= quantity`); stock shortage uses a separate conditional transaction. Terminal messages are acknowledged without stock changes. Technical failures use partial batch failures and SQS retries/DLQ.

Campaign records are stored in the `CAMPAIGNS_TABLE` DynamoDB table provisioned by the CloudFormation template. Public endpoints are `GET /campaigns` and `GET /campaigns/{campaignId}`; management endpoints are `POST /admin/campaigns` and `PATCH /admin/campaigns/{campaignId}`. Campaign status is derived from its timezone-aware start/end timestamps. Campaign and product catalog responses include `serverTime`, sale boundaries and a `saleStatus` (`UPCOMING`, `LIVE`, `ENDED` or `SOLD_OUT`) so clients can synchronize countdowns and display sale state using backend time. Order intake independently revalidates the sale window and stock state.

```powershell
.venv/Scripts/python -m unittest discover -s backend -p 'test_*.py' -v
```

See [deployment and operations](../docs/operations/aws-lab.md), [CloudFormation](../infrastructure/templates/flashrush.json) and [live evidence](../tests/evidence/). Unit tests use Moto; live test results are recorded separately. Team architecture approvals and full production authentication remain outside this lab implementation.
