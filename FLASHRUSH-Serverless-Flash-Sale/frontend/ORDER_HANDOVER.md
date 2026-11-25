> The [F10 handover](../docs/features/F10-atomic-cart-checkout.md) documents cart checkout, order snapshots, storage compatibility and rollout.

# Order flow handover

Work is integrated in the existing `FLASHRUSH-Serverless-Flash-Sale/frontend`, reusing the order implementation reviewed in PR #2 without creating a root-level frontend or changing that PR.

Run `npm run dev`, add two products and open the cart, or use Buy Now from a product. In mock mode, new orders are confirmed automatically after about six seconds. Vitest covers CONFIRMED, OUT_OF_STOCK and FAILED. Mock orders use browser storage and leave catalog stock unchanged.

To simulate status network failure in development, set `sessionStorage.setItem('flashrush.demo.networkError', 'true')` in DevTools. Processing keeps the order ID and shows a retry message. Remove that key to recover. This switch has no effect in production. Polling stops after 60 seconds or a terminal state, backs off on errors, pauses requests while the document is hidden, and cleans up on unmount. Manual status retry never submits a new order.

Order intent and tokens are saved in sessionStorage before POST. Identical retries reuse the same key and payload. Known order snapshots remain in localStorage. My Orders retrieves each known order through the service where the session token exists; there is no GET /orders list endpoint or account authentication. Losing the session token leaves only a local snapshot, not a verified live status.

## HTTP adapter

Set `VITE_ORDER_MODE=http` and `VITE_API_BASE_URL`, then restart Vite. The order adapter sends `items[]` with `Idempotency-Key` and reads server pricing and status with `X-Order-Token`. The timeout is ten seconds. Both 202 acknowledgements and 200 terminal replays are accepted. Ambiguous errors keep the saved intent available for retry.

The existing submit/getOrder interface is retained. PurchaseIntent stores the original items and idempotency key. The HTTP payload contains product IDs and quantities. The display uses current catalog values before checkout and historical snapshots after intake. Color remains a display choice.

The storefront links to `/cart` with a unit count. Cart and Checkout switch from two columns on desktop to one on narrow screens. OrderSummary serves Processing, Result and History.

Run `npm test` and `npm run build`. Manually verify all result states, refresh Processing, browser back/forward, history search and filters, blocked storage, network retry and layouts at 1440/1024/768/390/375 px. No Git commit, push, merge or AWS deployment is part of this change.
