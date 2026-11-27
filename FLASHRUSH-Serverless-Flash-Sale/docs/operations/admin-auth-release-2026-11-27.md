# Admin Cognito authentication release - 2026-11-27

The live admin product/campaign routes required AWS IAM signing while the
frontend sent Cognito access tokens. The source fix already existed on main;
this release applied its authentication changes to the live lab stack and
verified actual frontend writes against AWS.

## Deployment

- Account `303278700480`, region `us-east-1`, stack `flashrush-lab`.
- API `7h0r2fxsha`, Lambda `flashrush-lab-api`.
- Change set `admin-cognito-20261127T142330Z`: `UPDATE_COMPLETE`.
- Migrated 20 existing routes (18 admin routes, `GET /auth/me`, and
  `POST /auth/logout`) to the existing Cognito JWT authorizer with required
  scope `aws.cognito.signin.user.admin`.
- Added `DELETE /admin/campaigns/{campaignId}` with the same authorization.
  The frontend and handler already supported deletion. Added DELETE to CORS
  and `dynamodb:DeleteItem` only to the Campaigns table policy statement.
- API artifact SHA256:
  `b48cea67e485c30270c429c40e273c4664faa61fadb800b72eb9388bb0bc02c1`.

The API package was based on the deployed archive. Changes were restricted to
the auth/admin gates in `app.route` and `business.identity` (plus required
imports). Identity now validates token issuer, client, subject, expiry, access
token type and scope, checks the current account state, and reads live Cognito
group membership. Revoked credentials return 401. Legacy key access requires
an explicit opt-in plus verified IAM identity; the live routes require JWT.

All other functions/modules were preserved. The worker retained its exact
code SHA and revision. The CloudFormation change set had no replacements or
removals, and customer/public routes were unchanged. This was a scoped release,
not a deployment of every integration-hardening change on main.

## Verification

- Exact candidate package: 67 passing tests covering app, business, customer,
  vouchers and staff identity. Two existing source template tests also passed
  for staff JWT and customer voucher authorization.
- Verified deployed API hash, all 21 protected routes, unchanged worker and
  unchanged customer/public route definitions.
- Anonymous, invalid-token and key-only requests returned 401. An authenticated
  customer received 403 for product creation/editing and campaign creation/deletion.
- Using an isolated temporary account and the same token across group changes:
  warehouse could read inventory but could not edit products; support could
  read orders but could not edit products; manager passed authorization and
  received the expected 404 for a nonexistent test product. Removing the manager
  group immediately restored 403 without issuing a new token.
- Owner could read identity, overview, orders, vouchers, inventory and monitoring.
- Real browser sign-in and form submissions through `http://127.0.0.1:5173`:
  product create 201, product edit 200, campaign create 201, campaign edit 200,
  campaign delete 200. All five requests used bearer tokens without an admin key.
  No failed API responses or browser page errors occurred during that flow.
- DynamoDB confirmed the edited product name/price and successful campaign
  deletion. The test product had zero stock and a future sale window.
- Logout returned 200; replaying the signed-out token returned 401 for both
  identity and product editing.
- Customer voucher wallet and checkout quote regression reads returned 200.

## Cleanup and release boundary

Removed only the temporary product, campaign and Cognito account. All five
table hashes matched both the pre-test and pre-deployment snapshots after
cleanup: 26 products, 216 order-table items, 25 campaigns, 4 customer-table items
and 7 business-table items. Existing stock, orders, campaigns and demo accounts
were preserved.

Local evidence and rollback artifacts are under
`.build/admin-auth-release-20261127T142054Z/`, including original/candidate API
archives, original/candidate/rollback templates, reviewed change set, browser
screenshots, HTTP results and data comparisons. No passwords or bearer tokens
are included in the reports. Rollback must be reviewed against the current
stack before use; restoring the old template would restore the old IAM mismatch.

This verifies the current local frontend against the live AWS backend.
CloudFront frontend assets were not republished by this release. No UI layout
or user/admin source implementation needed changing for this fix.
