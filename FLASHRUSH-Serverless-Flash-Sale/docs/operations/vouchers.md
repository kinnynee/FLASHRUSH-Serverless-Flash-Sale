# Voucher wallet and checkout

All discounts now use managed vouchers in the existing Business table. HAUMON is retired: new quotes, saves and admin creation reject it, even if an old record still exists. Historical order snapshots remain unchanged. Pending checkouts containing the retired code fail validation without consuming stock; customers can place a new checkout with a current offer.

## Customer flow

1. Open `/account/vouchers` from the home banner or account navigation. Browse active/upcoming offers and save a code to the authenticated account. Saving is a bookmark and does not reserve stock or usage.
2. Select products in `/cart`. The server calculates eligibility from the current cart/version and selected lines. The wallet shows minimum spend, discount cap, expiry, remaining uses and why an offer cannot be applied.
3. Choose an offer or enter a code. The server recommends the largest actual discount after the cap. Selection is retained in sessionStorage; saved vouchers live in DynamoDB.
4. Review the address and final total at `/cart/checkout`. One merchandise voucher applies to the entire checkout group; codes cannot stack. Each account can redeem each code once. Standard delivery is currently free and payment is COD, so there is no separate shipping-discount voucher.
5. The worker rechecks the offer and atomically decrements stock, confirms all child orders, increments usage and writes the customer redemption. Failed orders do not consume a voucher. Replays retain the original key and cannot redeem twice.

Disabled and expired offers disappear from the wallet. Upcoming, exhausted, previously used and below-minimum offers explain their status. Saving does not protect an offer from admin changes. Changing or disabling an offer while checkout is pending can cause that checkout to fail with an explicit reason.

## Admin and initial offers

At `/admin/vouchers`, owner/manager can customize an offer or publish missing codes from the preset set. Reading the page does not create records. Publication uses conditional POSTs; existing codes, history and counters are never overwritten. Partial publication can be reloaded and retried safely.

| Code | Discount | Minimum order | Maximum discount | Total uses |
| --- | --- | --- | --- | --- |
| FLASH10 | 10% | VND 300,000 | VND 100,000 | 500 |
| SAVE50K | VND 50,000 | VND 500,000 | VND 50,000 | 300 |
| TECH15 | 15% | VND 2,000,000 | VND 300,000 | 200 |
| MEGA500 | VND 500,000 | VND 5,000,000 | VND 500,000 | 100 |
| WEEKEND8 | 8% | VND 1,000,000 | VND 200,000 | 300 |

Presets start when loaded and expire 30 days later. Names do not impose category or day-of-week restrictions: all apply to eligible Flash Sale products. Review/customize values before publication. Discounts round down to integer VND and cannot exceed the merchandise subtotal. Admin updates require the current version and cannot lower usageLimit below usedCount.

## API

- `GET /me/vouchers`: catalog with the authenticated caller's saved/used states.
- `POST /me/vouchers`: `{version, lineIds}`; returns eligibility, discount, missingSpend and bestCode. Client-supplied subtotal/owner is rejected.
- `POST /me/vouchers/save`: `{code}`; idempotent bookmark for the caller.
- `POST /me/vouchers/quote`: existing single-code quote API.
- `GET /me/checkout-quote`: delivery/payment options and generic voucherPolicy.
- `POST /me/checkout-quote`: authoritative selected-cart pricing.
- `POST /me/checkouts`: requires the reviewed expectedTotal when using a voucher.
- `GET /admin/vouchers`: existing offers plus editable presets.
- `POST /admin/vouchers` / `PATCH /admin/vouchers`: create/update managed offers.

Customer routes use the existing Cognito JWT authorizer and access scope. Wallet routes are included in the generator and static templates. No new AWS service/table is required. Saved records use `saved#<userId>#<code>`; redemptions use `redeem#<code>#<userId>`.

## Deployment and recovery

Deploy lab stack routes and API/worker code, then build the frontend with the lab API URL and Cognito client/region. The existing main CI manual deployment does not provision these routes. Publish preset vouchers using the authenticated admin UI after deployment; source changes alone do not create live discounts.

`scripts/ops/reconcile_pending.py --recover` resolves BusinessTable from stack outputs before processing overdue voucher checkouts through the same atomic worker. Retain existing orders and redemption records.

Catalog listing currently scans the Business table and performs per-code ownership reads. This fits the lab dataset; larger deployments need indexed/paginated voucher and wallet queries.

## Validation

Unit tests cover retirement, ownership, saved state, selected-line eligibility, caps/rounding, stale versions, expiry/disable, single-use redemption, interleaving transactions for the last use, and recovery in a fresh environment. Browser integration against local Moto verifies admin publication, registration/login, wallet persistence, recommendation, retired-code rejection, discounted checkout and final statuses at 1440/768/390 pixels. Local evidence is in `.build/voucher-wallet-e2e-result.json`; it is not evidence of a live AWS deployment.
