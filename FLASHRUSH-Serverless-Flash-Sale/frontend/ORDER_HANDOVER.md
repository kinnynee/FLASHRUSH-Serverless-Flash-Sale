# Order flow handover

Work is integrated in the existing `FLASHRUSH-Serverless-Flash-Sale/frontend`, reusing the order implementation reviewed in PR #2 without creating a root-level frontend or changing that PR.

Run `npm run dev`, open a product, choose quantity, click Buy Now, submit Checkout. The mock first acknowledges PENDING and resolves after six seconds. In development + mock mode the Checkout scenario selector allows CONFIRMED, OUT_OF_STOCK and FAILED. The selector is omitted from production builds. No stock is decremented, no AWS resources or payment services are used.

To simulate status network failure in development, set `sessionStorage.setItem('flashrush.demo.networkError', 'true')` in DevTools. Processing keeps the order ID and shows a retry message. Remove that key to recover. This switch has no effect in production. Polling stops after 60 seconds or a terminal state, backs off on errors, pauses requests while the document is hidden, and cleans up on unmount. Manual status retry never submits a new order.

Order intent and tokens are saved in sessionStorage before POST. Identical retries reuse the same key and payload. Known order snapshots remain in localStorage. My Orders retrieves each known order through the service where the session token exists; there is no GET /orders list endpoint or account authentication. Losing the session token leaves only a local snapshot, not a verified live status.

## HTTP adapter

Set `VITE_ORDER_MODE=http` and `VITE_API_BASE_URL` then restart Vite. Default remains mock. `httpOrderService.ts` follows the **draft**, not approved, contract in docs/requirements/system-overview.md: POST /orders with Idempotency-Key header and {productId, quantity}; GET /orders/{orderId} with X-Order-Token header. Tokens never enter URLs. Both 202 acknowledgements and 200 terminal replays are accepted. Non-2xx responses produce safe errors; transport failures do not produce FAILED states. Each request has a ten-second AbortController timeout.

The existing submit/getOrder interface is retained to reuse PR #2; PurchaseIntent is the UI snapshot plus idempotency key. The HTTP adapter strips display fields and mock outcome before transmitting. Backend MVP documents four states; PROCESSING is additionally understood for forward compatibility. Products are still mock: HTTP display enrichment uses productService and must be wired to the real Products API before an end-to-end AWS claim. Price is illustrative, not backend-authoritative billing. Colors are display-only under the current backend request contract.

Shared Header/Footer are reused. OrderSummary, OrderStatusBadge, OrderStatusIcon and OrderResultActions serve the state screens. Checkout is two columns on desktop and one on narrow screens; state cards and history adapt to mobile. Visual browser QA has not been verified in this environment (previous browser tool stopped because it could not determine the Edge URL). No screenshot-perfect or end-to-end browser testing claim is made.

Run `npm test` and `npm run build`. Manually verify all result states, refresh Processing, browser back/forward, history search and filters, blocked storage, network retry and layouts at 1440/1024/768/390/375 px. No Git commit, push, merge or AWS deployment is part of this change.
