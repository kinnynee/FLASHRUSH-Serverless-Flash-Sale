# FLASHRUSH — Frontend Demo

React + Vite + TypeScript + Tailwind CSS + React Router + Lucide React.
Implementation scope: Frontend Developer 1. No AWS, authentication, payments or real orders are connected.

## Run locally

Requires Node.js 22.12+ (verified with Node.js 24).

```powershell
cd "C:\work on AWS\FLASHRUSH-Serverless-Flash-Sale\FLASHRUSH-Serverless-Flash-Sale\frontend"
npm ci
npm run dev
```

Open the local URL printed by Vite. `npm run build` checks TypeScript and produces `dist/`; `npm run preview` serves that build. `npm test` runs behavior tests.

## Routes and ownership

| Route | Owner / behavior |
| --- | --- |
| `/` | Developer 1 — hero, countdown, categories, featured products |
| `/products` | Developer 1 — search, category, price range, sort |
| `/products/:productId` | Developer 1 — gallery, stock, colors, quantity, related products |
| `/checkout` | Checkout, persisted intent, same-key retry; HTTP mode quantity=1 |
| `/orders` | Checkout, persisted intent, same-key retry; HTTP mode quantity=1 |
| `/admin` | Admin Dashboard demo với KPI, tồn kho và đơn hàng chỉ đọc |
| `/admin/products` | Danh sách sản phẩm của phiên Admin demo |
| `/admin/orders` | Danh sách đơn hàng của phiên Admin demo |
| `/admin/monitoring` | Cloud Console demo cho Order, SQS, Lambda và alerts |

Search/filter state is encoded in `q`, `category`, `min`, `max`, `sort` URL parameters. Sort values: `discount`, `price-asc`, `price-desc`, `popular`. Search accepts Vietnamese with or without accents. Filters combine, price bounds are inclusive. Invalid product IDs and unknown routes have recovery links.

## Admin and monitoring demo

Open `/admin` to review the read-only Admin Dashboard and `/admin/monitoring` to open the observability view. Both pages are labelled as simulation data and do not connect to AWS, use AWS credentials, change stock, replay queue messages or edit orders.

The default scenario is **Cảnh báo DLQ**, a fixed snapshot with 100 accepted requests, 10 confirmed orders, 88 out-of-stock orders and 2 failed orders. The Monitoring page has controlled scenarios for normal operation, an empty session and a loading error. Its refresh control reloads the selected snapshot without generating random values. Product inventory is derived from the same confirmed mock orders used by the KPI cards.

`src/services/dashboardService.ts` exposes the dashboard service abstraction. `mockDashboardService.ts` is active. `httpDashboardService.ts` is an integration seam only because the documented MVP contract has no protected dashboard endpoint.

## Mock behavior

- `src/mocks/products.ts`: 12 stable product IDs, 6 categories, VND prices, sold-out and low-stock examples.
- `src/services/productService.ts`: typed adapter; `getProducts()` and `getProductById(productId)` return Promises. Mock responses are cloned, delayed by 350 ms, and never change stock.
- Sale ends three hours after the browser session first starts. The ISO timestamp is stored in `sessionStorage` under `flashrush.demo.saleEndsAt.v1` and preserved across navigation/reloads. Once expired, buying is disabled; it does not silently restart.
- To inspect expiry: set that sessionStorage key to an ISO timestamp in the past in your browser DevTools, then reload. Remove the key to start a new demo session.
- To inspect loading, refresh any product page. To inspect errors, copy `.env.example` to `.env`, set `VITE_DEMO_SERVICE_ERROR=true`, restart Vite. Restore `false` and restart afterwards.
- Photos are illustrative local assets; they are not guaranteed to match the exact brand/model/color. Sources: `public/images/SOURCES.md`. A local SVG fallback handles missing images.
- Session times on the homepage are explicitly an illustrative schedule, not separate implemented sales.

## Developer 2 integration contract

Types: `src/types/product.ts` exports `Product` and `CheckoutIntent`. `src/utils/product.ts` exports `checkoutUrl(intent)`. Proposed route:

```text
/checkout?productId={productId}&quantity={quantity}&color={optionalSelectedColor}
```

This is a temporary frontend contract requiring Developer 2 confirmation. IDs are stable slugs, never list indexes. Retrieve a fresh product with `productService.getProductById(productId)` and validate quantity/availability again. URL data is untrusted. Never accept price or stock supplied by a query string as authoritative.

Buy Now navigates to Checkout. Orders support processing, result and browser history. Default mode is mock; VITE_ORDER_MODE=http uses the configured API for products and orders. Admin/Monitoring remain simulated.

Shared components are organized under `components/common`, `components/layout`, `components/product`. Theme tokens in `src/styles/index.css` (`@theme`) are also usable as Tailwind utilities, e.g. `bg-brand`, `text-ink`, `bg-canvas`. Reuse `Button` primary/secondary, `formatPrice`, `StockIndicator`, `LoadingSkeleton`, and `EmptyState`. Follow native button/link semantics, explicit field labels, visible keyboard focus, and reduced-motion preferences.

## Next sprint API contracts to agree

- `GET /products`: product list and eventually server filtering/pagination.
- `GET /products/{productId}`: current price, availability, sale deadline, media and variants.
- Sale/session metadata: server UTC time and sale start/end timestamps for clock skew handling.
- Developer 2: order submission/idempotency and asynchronous order status contract with the backend; these endpoints are not implemented here.
- Backend remains authoritative for stock, pricing, variant validation and sale eligibility.

## Static hosting handover

Deploy `dist/` to S3/CloudFront when authorized. BrowserRouter requires a CloudFront SPA fallback/rewrite to `index.html` for application routes; preserve actual asset requests and their failures. Direct visits to `/products/...` must be tested after hosting is configured. No infrastructure is created by this frontend task.

## Verification — 2026-11-18

- Audit remediation 2026-11-20: 26 tests passed in 5 files; production build passed.
- Historical dependency audit text was stale; run `npm audit` for current results.
