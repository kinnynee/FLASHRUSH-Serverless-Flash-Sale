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
| `/checkout` | Developer 2 — currently a neutral integration notice only |
| `/orders` | Developer 2 — currently a neutral integration notice only |

Search/filter state is encoded in `q`, `category`, `min`, `max`, `sort` URL parameters. Sort values: `discount`, `price-asc`, `price-desc`, `popular`. Search accepts Vietnamese with or without accents. Filters combine, price bounds are inclusive. Invalid product IDs and unknown routes have recovery links.

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

The Buy Now handler currently prepares the URL and displays an inline handover notice, without navigating to an unfinished checkout. It does not create an order, reserve stock or claim purchase success. After Developer 2 integrates Checkout, replace this notice action with navigation to `checkoutUrl(intent)` and replace the placeholder route in `App.tsx`. The `/orders` route is similarly reserved. Do not add a second Header/Footer: `App.tsx` already owns the shared layout.

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

- `npm test`: 11 tests passed in 2 files. Covers combined filters, accent-insensitive search, numerical sorting, empty results, quantity limits, countdown/expiry, checkout URL encoding, stable IDs, unknown IDs, cloned responses, service errors and retry recovery.
- `npm run build`: passed TypeScript checking and Vite production compilation.
- Local dev HTTP request to `/products/sony-wh-1000xm5`: 200. This verifies the development server fallback, not browser rendering or deployed CloudFront routing.
- All 13 referenced local product photographs exist.
- `npm audit --omit=dev`: 0 vulnerabilities. Full audit: 5 high findings in the development toolchain, rooted in the transitive `picomatch` ReDoS advisory GHSA-fc5q-39xc-vjpf (propagating through fdir/tinyglobby/Vite/Vitest). The registry's latest picomatch version at verification was 4.0.7 and was still in the affected range. No forced dependency downgrade was applied. Recheck patched versions before publishing a shared development environment; the dev server is bound to loopback.
- **Visual/browser QA remains unverified.** Browser-tab control was unavailable; Windows Edge control then stopped because the tool could not determine the current URL confidently enough to enforce its policy. No desktop/mobile screenshots, rendered-overflow checks or end-to-end browser interaction claims are made.
- CSS includes desktop, tablet, mobile and reduced-motion breakpoints. Manually review at 1440, 1024, 768, 390 and 320 px: header/search, 4/3/2/1-column grids, detail stacking, no horizontal scrolling, focus states, gallery, filters, empty/error states, sold-out purchase disabling, expiry and Checkout notice.

No commits, pushes, merges or deployments were performed for this implementation.
