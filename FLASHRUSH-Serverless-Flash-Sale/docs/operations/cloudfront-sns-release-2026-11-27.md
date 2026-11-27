# CloudFront frontend and SNS workshop readiness - 2026-11-27

The public website served an older frontend without the voucher wallet or
cart checkout routes. Direct navigation to `/staff/login` returned S3
AccessDenied because the deployed CloudFront rewrite omitted `staff`.
The alert topic had no subscriptions. This release published the current
frontend and enabled confirmed email recipients for the existing alarms.

## Target and release

- Account `303278700480`, region `us-east-1`, stack `flashrush-lab`.
- Website: https://d1jcrzj4650vey.cloudfront.net
- Distribution: `E1UN1ZTHCN0K5T`.
- API: `https://7h0r2fxsha.execute-api.us-east-1.amazonaws.com`.
- Frontend source commit: `be3e887`; HTTP mode with the lab Cognito client.
- Scoped CloudFormation change set: `web-staff-route-20261127T153216Z`,
  completed successfully. Only the SpaRewrite FunctionCode changed in the
  template; distribution/CORS references were reevaluated without replacements.
- Applied the existing source template's rewrite, including `staff`, while
  preserving missing static asset errors.
- Published 6 changed objects from a 23-file build at 22:36:47 UTC+7. Assets
  were uploaded and hash-verified before index.html; old hashed assets remain
  available. Every existing object that could be overwritten was backed up
  with content and metadata before publication.
- Invalidation `I14H1B8009G31WD6KV817SZ0PU` completed for `/*`.
- API and worker retained their exact code hashes and revision IDs. No catalog
  seeding, order submission, inventory adjustment or data migration was run.

## Public website checks

- 80 frontend tests passed during the immediately preceding readiness audit;
  the explicit HTTP/Cognito release build passed TypeScript and Vite checks.
- 12 rewrite checks passed for application routes and unchanged asset paths.
- `/`, `/account/vouchers`, `/cart/checkout` and `/staff/login` returned HTTP 200
  with the exact newly published index bytes. A nonexistent JS asset returned
  403, rather than being rewritten to HTML.
- Real customer and staff sign-in succeeded on the public CloudFront domain.
- 13 browser checks covered desktop/mobile home, catalog, voucher wallet, cart,
  checkout, customer orders, admin overview/products/campaigns/orders/vouchers
  and monitoring. API responses were 200, with no page errors, error alerts,
  missing-page messages or horizontal overflow in the tested viewports.
- The voucher wallet displayed FLASH10, SAVE50K, TECH15, MEGA500 and WEEKEND8.
  Checkout loaded its quote/options API and showed the expected empty-selection
  state for the demo account. No new purchase was submitted by this smoke check;
  full purchase evidence is in `checkout-verification-2026-11-27.md`.

## SNS and email verification

Existing DLQ-depth, queue-age and worker-error alarms already had actions
enabled and targeted `flashrush-lab-alerts`. Three email subscriptions are now
confirmed and active, according to the user's final recipient selection.
Recipient addresses are kept out of this public report.

A separate temporary alarm, `flashrush-lab-workshop-email-test-20261127T153947Z`,
used the existing topic and a clearly labeled WORKSHOP TEST reason. Its manual
OK-to-ALARM transition tested notification delivery without generating an
application failure or modifying the three operational alarms.

CloudWatch action history reported successful SNS publication at 22:39:57
UTC+7. The user confirmed receipt of the test email in this conversation.
This establishes CloudWatch -> SNS -> a checked inbox; receipt in each of the
three inboxes was not independently inspected. The temporary alarm was deleted,
and the original alarm configurations were unchanged with all states OK.

One initially requested recipient was withdrawn while PendingConfirmation.
AWS rejected Unsubscribe with `Cannot unsubscribe a subscription that is
pending confirmation`. That pending endpoint is inactive and receives no
alerts; it was not falsely reported as deleted. Do not confirm its old link.
If it is subsequently confirmed, an operator must remove that subscription
using its actual ARN after verifying the endpoint. No further confirmation
request was sent to the withdrawn recipient.

## Evidence and rollback

Local artifacts: `.build/web-sns-release-20261127T153216Z/`, containing the
original/candidate CloudFormation templates, rewrite source, artifact manifest,
S3 object/metadata backups, reviewed change set, publication/invalidation
details, browser screenshots, HTTP results and CloudWatch action evidence.
Passwords and bearer tokens are not included in the reports. Subscriber email
addresses remain only in ignored local evidence and AWS configuration.

Before any rollback, review concurrent changes. Restore only this release's
overwritten objects from the backups, upload the prior index last, and
invalidate CloudFront. Retain new hashed assets for browsers that loaded the
new index. If reverting the rewrite, patch only SpaRewrite against the current
template; do not restore an old whole-stack template over subsequent releases.
