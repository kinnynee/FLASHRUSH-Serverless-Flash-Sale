# Automatic main deployment

Push main triggers Deploy AWS main. Tests (backend/deploy/load report/frontend), npm audit and TypeScript/HTTP build must pass before the deploy job gets AWS OIDC credentials. Pull requests run the existing offline CI; they have no deployment credentials.

Target: account303278700480/us-east-1, manual API/Worker, website bucket and distribution EICTCJNYW9CL1. OIDC trust is repository kinnynee/FLASHRUSH-Serverless-Flash-Sale, refs/heads/main only. No long-lived access keys or GitHub secrets required. Deploy role cannot manage IAM, tables or stock.

Deploy serializes releases, backs up Lambda packages/index, uploads assets before index, verifies hashes, waits invalidation, checks website/API read routes. Failed release attempts automatic Lambda/index restoration. Other static assets are retained; replacing a same-name public asset is not fully atomic. Backup artifacts retained14days. GitHub run summary/logs show completion; domain updates only after a successful deploy.

Campaign dependencies from upstream main are installed once outside deployment role. Public campaign read routes are enabled. Admin campaign writes are intentionally not exposed without authorization. Campaign data/stock are not reset by CI. Recovery and load test remain explicit operator tools; CI does not run live load/recover.

Changes to workflows/deployment code on main can deploy code through this role; protect main/review changes. Current GitHub account has push but no repository-admin access, so branch protection was not configured.
