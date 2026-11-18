# FLASHRUSH backend

Python 3.12 Lambda API and SQS Worker are packaged together from `app.py`, with distinct handlers and least-privilege roles. Runtime uses Lambda's included boto3. Development dependencies are isolated in `.venv`.

API supports product catalog, intake and token-protected status. Quantity is restricted to 1. A deterministic order ID and conditional Put enforce idempotency. An enqueue lease coordinates SQS sends, including uncertain timeout recovery. Worker confirms orders and decrements stock in a single conditional DynamoDB transaction; stock shortage uses a separate conditional transaction. Terminal messages are acknowledged without stock changes. Technical failures use partial batch failures and SQS retries/DLQ.

```powershell
.venv/Scripts/python -m unittest discover -s backend -p 'test_*.py' -v
```

See [deployment and operations](../docs/operations/aws-lab.md), [CloudFormation](../infrastructure/templates/flashrush.json) and [live evidence](../tests/evidence/). Unit tests use Moto; live test results are recorded separately. Team architecture approvals and full production authentication remain outside this lab implementation.
