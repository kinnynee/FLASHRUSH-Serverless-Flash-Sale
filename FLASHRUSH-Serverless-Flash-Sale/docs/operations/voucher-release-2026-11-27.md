# Voucher wallet AWS release - 2026-11-27

The lab voucher wallet is deployed and verified. CloudFormation reached
`UPDATE_COMPLETE` after updating API/worker code and adding three customer JWT
routes. This is a scoped release, not deployment of the full main-branch hardening.

## Target and scope

- Account: `303278700480`; profile: `flashrush`; region: `us-east-1`.
- Stack: `flashrush-lab`; API ID: `7h0r2fxsha`.
- Change set: `voucher-wallet-20261127T140213Z`.
- API and worker updates completed at 21:03:30, Asia/Bangkok.
- Added `GET /me/vouchers`, `POST /me/vouchers`, `POST /me/vouchers/save`.
- All three routes use the existing Cognito JWT authorizer and access scope.
- CloudFormation also reevaluated the unchanged Integration URI reference to
  the API ARN. No resources were removed or replaced; no IAM policy changed.

Each package was built from that function's downloaded live archive. Only
`vouchers.py` and the voucher/pricing functions in `customer.py` changed.
The customer functions copied from main were `checkout_view`, `checkout_options`,
`selected_cart`, `price_checkout`, `checkout_quote`, `create_checkout`,
`process_checkout` and `route`. Other customer functions were checked for AST
equality; every other archive entry remained byte-identical. This preserves
existing admin behavior and the earlier API campaign selector fix.

This also activates the existing `/me/checkout-quote` routes, which previously
returned NOT_FOUND because the deployed customer handler lacked pricing support.
The worker now validates the same quote and voucher rules as the API. Existing
checkouts without a pricing snapshot remain supported.

## Published offers

The admin API published missing codes only, using its conditional POST operation:
`FLASH10`, `SAVE50K`, `TECH15`, `MEGA500`, `WEEKEND8`. Their values and limits come
from the existing preset definitions. They expire 30 days after publication.
All five had zero redemptions at verification. HAUMON is rejected and excluded
from both customer and admin listings.

## Verification

- 32 customer/voucher Moto tests passed against each exact candidate package
  (64 executions), including atomic stock/voucher handling, retries and retirement.
- Both deployed Lambda code hashes match the prepared artifacts.
- Live customer checks passed: wallet listing, CORS, save persistence, selected-cart
  eligibility, server-calculated discount, rejected client subtotal, rejected HAUMON,
  checkout options and denied customer access to voucher administration.
- A VND 890,000 selection quoted FLASH10 discount VND 89,000 and total VND 801,000.
- Admin can read five offers and five presets; creating HAUMON returns
  `400 VOUCHER_RETIRED`. Anonymous wallet requests return 401; customer admin
  requests return 403.
- Browser verification used real logins and the lab API: five customer voucher
  cards at desktop/mobile sizes, five admin rows/presets, no cart/checkout quote
  errors, no failed API responses and no browser page errors.
- No purchase was submitted. Full before/after hashes of all existing products,
  campaigns and orders were identical. Temporary verification account, cart and
  bookmark were removed; the user's demo accounts were retained.

## Artifacts and recovery

Local evidence and backups: `.build/voucher-release-20261127T135800Z/`.
This contains original Lambda ZIPs, original/scoped/rollback templates, reviewed
change set, artifact manifest, protected-data hashes, live verification and browser
screenshots. No passwords or authentication tokens are recorded in these reports.

Deployed ZIP SHA256 values (base64):

- API: `Bk8AvoBJwid4Vh16zTwYKaQp2aMG7k5GTqfH1f4Mp4U=`
- Worker: `BqRj0v2aF6O89IKE3Z9PVcJxuz73VeubvgOWL8bvVOo=`

Original and candidate ZIPs are retained in the existing private artifact bucket
under `lambda/voucher-release/`. `template-rollback.json` points to the actual
pre-release Lambda archives, including the campaign selector patch, rather than
the stale code keys previously recorded in CloudFormation. If rollback is needed,
first review in-flight checkouts and create/review a change set using that template
with existing parameter values. Preserve voucher redemption/history records.

No CloudFront assets were published. The latest local frontend at port 5173 uses
the repaired AWS backend. Admin product/campaign IAM-route migration and the rest
of the full hardening release remain separate work.
