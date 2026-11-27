# Live checkout verification - 2026-11-27

The reported `/me/checkout-quote` 404 is resolved by the scoped voucher release
documented in `voucher-release-2026-11-27.md`. That release activated the existing
GET/POST routes by deploying the missing customer pricing handler to the API and
matching validation to the worker. This follow-up verified the complete purchase
flow against AWS; no further runtime code or infrastructure change was needed.

## Environment

- Account `303278700480`, region `us-east-1`, stack `flashrush-lab`.
- Frontend `http://127.0.0.1:5173`, API `7h0r2fxsha`.
- Local source included main's storefront updates through `496dcae`.
- Isolated temporary Cognito customer, two products, one active campaign and one
  voucher. None of the user's demo account/cart/address data was modified.

## Verified end to end

1. Customer signed in through the actual frontend.
2. Added both products from their detail pages, opened the cart and selected them.
3. Applied a 10% voucher: subtotal VND 900,000, discount VND 90,000, total VND 810,000.
4. Checkout loaded the address, standard free delivery, COD and server quote.
5. Submitted the reviewed checkout through the UI on a mobile viewport.
6. API returned 202 and SQS/Lambda confirmed both child orders. Stored timestamps
   show acceptance at 21:15:29 and confirmation at 21:15:31, Asia/Bangkok.
7. Customer results/history and the admin orders page showed both orders correctly.
8. Replayed the identical idempotency key and body: HTTP 200, same checkout ID,
   still two orders. Each temporary product's stock changed only from 3 to 2;
   voucher usedCount remained 1 with one redemption.

Final browser checks had no page errors or failed API calls. Checkout and order
results were visually inspected at desktop/mobile sizes; mobile had no horizontal
overflow. The first harness wait for a localized status string timed out after
the backend had already confirmed the order. A CSS status selector verified the
existing orders; the harness did not submit another purchase.

## Cleanup and evidence

After terminal order status and an empty queue, removed only the exact temporary
orders, customer records, redemption, voucher, campaign, products and Cognito user.
Full before/after hashes of Products, Orders, Campaigns, Customers and Business
tables matched. Existing stock, orders, vouchers and accounts were preserved.

Local evidence: `.build/checkout-live-20261127T141345Z/`, including accepted
checkout metadata, browser/transaction verification, cleanup hashes and screenshots.
Passwords and bearer tokens are not included in those evidence files.

This confirms the latest local frontend with the live lab backend. CloudFront
assets were not republished, and unrelated admin IAM-route migration remains
outside this checkout verification.
