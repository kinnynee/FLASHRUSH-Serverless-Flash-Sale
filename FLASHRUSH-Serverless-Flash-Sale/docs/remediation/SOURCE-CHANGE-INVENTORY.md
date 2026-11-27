# Source change inventory

Paths below are repository-relative. Git HEAD diff includes preexisting user work; the SHA256 baseline distinguishes what this remediation actually changed. No commit, push, stash or destructive Git operation occurred.

## Changed or added by remediation

- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/SOURCE-CHANGE-INVENTORY.md`
- `.github/workflows/deploy-main.yml`
- `FLASHRUSH-Serverless-Flash-Sale/backend/app.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/business.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/customer.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/test_app.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/test_business.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/test_hardening.py`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/ECOMMERCE-DEPLOYMENT-RUNBOOK.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/ECOMMERCE-FIX-CHANGELOG.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/ECOMMERCE-REGRESSION-REPORT.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/NINE-SERVICE-ARCHITECTURE-IMPACT.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/VOUCHER-BASELINE-PRESERVATION.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/WORKSHOP-CHANGE-IMPACT.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/remediation/target.example.json`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/admin/AdminApiKeyControl.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/admin/AdminTables.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/admin/StaffGate.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/dashboard/DashboardLayout.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/order/OrderSummary.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/AccountPage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/AdminDashboardPage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/CustomerAccountPage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/accountService.test.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/accountService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/adminAuth.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/campaignService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/customerAuth.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/customerService.test.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/customerService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/customerSessionHardening.test.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/httpDashboardService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/httpOrderService.test.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/httpOrderService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/mockDashboardService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/monitoringService.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/sessionHardening.test.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/types/dashboard.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/types/order.ts`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/utils/orderPrice.ts`
- `FLASHRUSH-Serverless-Flash-Sale/infrastructure/templates/business-extension.json`
- `FLASHRUSH-Serverless-Flash-Sale/infrastructure/templates/flashrush.json`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/ci/deploy_manual.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/ci/release_check.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/deploy.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/target_config.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/test_lab.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/test_release_check.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/test_target_config.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/ops/backfill_order_history.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/ops/reconcile_pending.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/ops/test_backfill_order_history.py`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/ops/test_reconcile_pending.py`

## Preexisting changes preserved byte-for-byte

- `.github/workflows/offline-checks.yml`
- `FLASHRUSH-Serverless-Flash-Sale/backend/test_customer.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/test_vouchers.py`
- `FLASHRUSH-Serverless-Flash-Sale/backend/vouchers.py`
- `FLASHRUSH-Serverless-Flash-Sale/docs/operations/cart-voucher-checkout.md`
- `FLASHRUSH-Serverless-Flash-Sale/docs/operations/vouchers.md`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/App.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/admin/VoucherPresetPanel.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/customer/VoucherWallet.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/AdminVouchersPage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/CartPage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/HomePage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/VouchersPage.tsx`
- `FLASHRUSH-Serverless-Flash-Sale/frontend/src/styles/vouchers.css`
- `FLASHRUSH-Serverless-Flash-Sale/infrastructure/templates/customer-extension.json`
- `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/customer_resources.py`

The temporary integration harness/server files under ignored `.build` were removed after testing. Evidence logs, baseline hashes, report JSON and inspected screenshot remain local.
