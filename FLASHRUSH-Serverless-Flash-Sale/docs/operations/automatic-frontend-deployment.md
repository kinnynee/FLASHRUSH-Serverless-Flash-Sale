# Automatic lab frontend deployment

Every push to main runs frontend/backend/tool checks, lint, audit and a build configured for the lab API/Cognito. GitHub OIDC assumes flashrush-github-lab-frontend, scoped to the lab website bucket and distribution E1UN1ZTHCN0K5T. No long-lived AWS keys are stored.

The publisher verifies account, bucket owner, enabled distribution and S3 origin, lab API URL embedded in assets, and public catalog/campaign endpoints. It backs up existing objects, uploads assets before index, verifies S3 hashes, waits for CloudFront invalidation and compares deployed HTML with the release index across public deep links. On failure it restores overwritten objects with index last and invalidates again. New hashed assets remain for clients that fetched a new index. Backup metadata/results are retained as Actions artifacts for 14 days.

Website: https://d1jcrzj4650vey.cloudfront.net

Automatic scope is frontend only. Lambda/backend/database/auth configuration deployment remains explicit workflow_dispatch with reviewed inventory, credentials, preflight and authenticated smoke checks. Auto frontend deployment does not claim a new backend or authenticated end-to-end verification. For new API contracts, deploy compatible backend before merging dependent frontend.

Do not use manual distribution EICTCJNYW9CL1 for this automatic job. A failed check prevents publication; a failed smoke fails the workflow even if rollback succeeds. Inspect result.json or failure.json rather than treating a pushed commit as a verified release.
