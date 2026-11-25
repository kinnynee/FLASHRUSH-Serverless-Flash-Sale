# Customer commerce

The storefront uses the existing HTTP catalog and order services. Customer authentication uses Cognito; administrator IAM/API-key access and guest order tokens remain separate. No production mock fallback is used.

## Deployment

Run `scripts/deploy/deploy.py --profile flashrush --region us-east-1` with the existing `FLASHRUSH_ADMIN_API_KEY` supplied securely. Wait for CloudFormation `UPDATE_COMPLETE`, then run `scripts/deploy/publish.py` with the same target arguments. Publishing builds with `ApiUrl`, `CustomerClientId`, and `CustomerRegion` from stack outputs, uploads assets before index.html, and invalidates CloudFront. Catalog seeding is opt-in via `FLASHRUSH_SEED_CATALOG=true`; leave it unset for normal releases. The deploy script refuses resource removal or replacement.

For local development set `VITE_ORDER_MODE=http`, `VITE_API_BASE_URL`, `VITE_COGNITO_REGION`, and `VITE_COGNITO_CLIENT_ID` in the ignored frontend `.env.local`. Cognito client identifiers are public; never place AWS credentials or the admin API key in the frontend.

## Resources and API

New resources: Cognito user pool and public client, DynamoDB CustomerData table (PITR and retain policies), API Gateway JWT authorizer and eight routes. Existing Lambda roles receive scoped access to the customer table; worker receives campaign read/condition permissions. CORS allows Authorization and PUT. CloudFront rewrites cart/account/auth routes to the SPA.

| Method | Route | Purpose |
| --- | --- | --- |
| GET, PUT | `/me/profile` | Profile and receiving addresses |
| GET, PUT | `/me/cart` | Versioned cart enriched with current product data |
| POST | `/me/checkouts` | Idempotent checkout of selected cart lines |
| GET | `/me/checkouts/{checkoutId}` | Group status and safe enqueue recovery |
| GET | `/me/orders` | Cursor-paginated customer orders |
| GET | `/me/orders/{orderId}` | Owned order detail |

All routes require Cognito access tokens, the expected issuer/client/scope, and a verified email. Lambda calls Cognito GetUser to reject revoked sessions. Ownership derives exclusively from the authenticated subject, never a submitted user ID. Cart and profile writes require a matching version; conflicts return 409.

## Checkout guarantees

Adding to a cart does not reserve stock. Checkout validates current prices, inventory, sale windows and aggregate campaign quantity limits. Each line creates a legacy-compatible child order within a checkout group. A DynamoDB transaction creates all child orders and owner indices, stores the group and removes selected cart lines. SQS schema version 2 processes the group atomically. The worker validates again and atomically decrements stock and confirms every child, or fails the whole group. Legacy messages cannot process customer child orders.

The browser retains the pending checkout intent/key per user in sessionStorage so a timeout can retry the same request. The enqueue lease and reconciler recover ambiguous SQS sends without creating duplicate groups. Use the existing reconciliation operation with CustomersTable available; do not independently reconcile child orders as guest orders.

## User experience and limits

Email signup/verification, password reset, sign-in, profile editing, address/default-address management, cart selection/quantity/removal, grouped checkout, purchase history, password change and sign-out are supported. Avatar editing accepts an HTTPS image URL, not file upload. Order filters apply to loaded pages; users can load more. Multi-product checkout is displayed as a group of individual product orders, preserving existing order reporting.

## Validation

Local checks: 62 frontend tests, 38 backend tests, 8 deployment tests; lint, typecheck and production build pass. Browser integration against isolated Moto exercises registration, email confirmation, login, addresses, two-product cart, quantities, selection, atomic SQS checkout, order history, password change and subsequent login. Responsive checks cover 1440, 768 and 390 pixels. Moto validation does not establish live email delivery or API Gateway JWT behavior; deployment smoke checks must verify live services separately.

No commit or push is part of deployment authorization. Existing uncommitted work is preserved.

## Live deployment verification (2026-11-25)

CloudFormation reached UPDATE_COMPLETE. The published storefront uses the real Cognito public client and API Gateway endpoint; CloudFront invalidation completed. Local `.env.local` also points to these deployed services.

Browser checks against CloudFront passed: Cognito login, authenticated profile, default address, mini cart, two products, quantity and total updates, responsive layouts at 1440/768/390, checkout through SQS to two CONFIRMED orders, private purchase history, password change, logout and login with the changed password. No browser JavaScript errors occurred. DynamoDB showed stock decremented exactly once. Separate live checks confirmed anonymous/ID-token rejection, revoked-token rejection, and cross-user order/checkout isolation. F06 monitoring returned HTTP 200 with live metrics.

The live test used dedicated admin-created test identities and temporary products/campaign; it did not test email delivery or self-service signup confirmation against a real mailbox. Those flows passed in the isolated local emulator. Test identities and business records were removed afterwards. Existing customer/catalog/order records were not replaced. Historical CloudWatch telemetry includes the verification requests.

The previous frontend is replaced on the same CloudFront URL. Obsolete JS/CSS bundles are removed from the website bucket after a local backup; product images, current assets, guest order tracking and administrator pages remain in use.

## Files in the current uncommitted implementation

Includes the preceding storefront redesign and the customer-commerce work. Pre-existing unrelated operations/evidence edits are excluded.

- [backend/app.py](../../backend/app.py)
- [backend/customer.py](../../backend/customer.py)
- [backend/test_customer.py](../../backend/test_customer.py)
- [docs/operations/customer-commerce.md](../../docs/operations/customer-commerce.md)
- [frontend/.env.example](../../frontend/.env.example)
- [frontend/eslint.config.js](../../frontend/eslint.config.js)
- [frontend/index.html](../../frontend/index.html)
- [frontend/package-lock.json](../../frontend/package-lock.json)
- [frontend/package.json](../../frontend/package.json)
- [frontend/src/App.tsx](../../frontend/src/App.tsx)
- [frontend/src/components/customer/CustomerProvider.tsx](../../frontend/src/components/customer/CustomerProvider.tsx)
- [frontend/src/components/layout/Header.tsx](../../frontend/src/components/layout/Header.tsx)
- [frontend/src/components/layout/Navbar.tsx](../../frontend/src/components/layout/Navbar.tsx)
- [frontend/src/components/product/SaleSchedule.tsx](../../frontend/src/components/product/SaleSchedule.tsx)
- [frontend/src/components/product/StockIndicator.tsx](../../frontend/src/components/product/StockIndicator.tsx)
- [frontend/src/hooks/useStorefrontCampaigns.ts](../../frontend/src/hooks/useStorefrontCampaigns.ts)
- [frontend/src/main.tsx](../../frontend/src/main.tsx)
- [frontend/src/pages/CartPage.tsx](../../frontend/src/pages/CartPage.tsx)
- [frontend/src/pages/CheckoutPage.tsx](../../frontend/src/pages/CheckoutPage.tsx)
- [frontend/src/pages/CustomerAccountPage.tsx](../../frontend/src/pages/CustomerAccountPage.tsx)
- [frontend/src/pages/CustomerAuthPage.tsx](../../frontend/src/pages/CustomerAuthPage.tsx)
- [frontend/src/pages/HomePage.tsx](../../frontend/src/pages/HomePage.tsx)
- [frontend/src/pages/OrderHistoryPage.tsx](../../frontend/src/pages/OrderHistoryPage.tsx)
- [frontend/src/pages/ProductDetailPage.tsx](../../frontend/src/pages/ProductDetailPage.tsx)
- [frontend/src/pages/ProductListingPage.tsx](../../frontend/src/pages/ProductListingPage.tsx)
- [frontend/src/services/customerAuth.ts](../../frontend/src/services/customerAuth.ts)
- [frontend/src/services/customerService.test.ts](../../frontend/src/services/customerService.test.ts)
- [frontend/src/services/customerService.ts](../../frontend/src/services/customerService.ts)
- [frontend/src/styles/customer.css](../../frontend/src/styles/customer.css)
- [frontend/src/styles/storefront.css](../../frontend/src/styles/storefront.css)
- [frontend/src/utils/catalog.test.ts](../../frontend/src/utils/catalog.test.ts)
- [frontend/src/utils/catalog.ts](../../frontend/src/utils/catalog.ts)
- [frontend/src/utils/product.ts](../../frontend/src/utils/product.ts)
- [frontend/src/utils/storefront.test.ts](../../frontend/src/utils/storefront.test.ts)
- [frontend/src/utils/storefront.ts](../../frontend/src/utils/storefront.ts)
- [frontend/vite.config.ts](../../frontend/vite.config.ts)
- [infrastructure/templates/flashrush.json](../../infrastructure/templates/flashrush.json)
- [scripts/ci/deploy_manual.py](../../scripts/ci/deploy_manual.py)
- [scripts/deploy/customer_resources.py](../../scripts/deploy/customer_resources.py)
- [scripts/deploy/deploy.py](../../scripts/deploy/deploy.py)
- [scripts/deploy/publish.py](../../scripts/deploy/publish.py)
- [scripts/deploy/test_lab.py](../../scripts/deploy/test_lab.py)
- [scripts/ops/reconcile_pending.py](../../scripts/ops/reconcile_pending.py)
