# Voucher baseline preservation

Baseline recorded before edits at local main commit `96be4e1`. The baseline contains modified tracked files and five untracked files. Hashes and the preexisting tracked diff are retained under `.build/integration-hardening-baseline/`. No stash/reset/restore/pull/commit/push was used.

The core `backend/vouchers.py`, `backend/test_vouchers.py`, and `backend/test_customer.py` are byte-identical to the starting workspace. Voucher pricing/redemption policy was not refactored. HAUMON retirement checks remain explicit; no hardcoded HAUMON discount was restored. FLASH10, SAVE50K, TECH15, MEGA500 and WEEKEND8 presets, wallet routes, saved customer ownership and atomic redemption remain present.

The previously untracked VoucherPresetPanel.tsx, VoucherWallet.tsx, VouchersPage.tsx and vouchers.css remain byte-identical. The previously untracked recovery test was expanded while retaining its CloudFormation BusinessTable/once-only voucher regression.

Necessary adjacent changes: customer order views/legacy indexing and explicit snapshot metadata; customer request/session guards; missing legacy address/group handling; shared JWT routes and infrastructure tags; release configuration and grouped recovery. CustomerService.test.ts only adds the session-version export to its mock beyond the baseline. No policy change was made to eligibility, limits, validity dates or saving/redemption.

The full backend suite includes all existing voucher tests. Local browser integration saved a dedicated LOCAL10 fixture, rejected HAUMON and confirmed a two-item checkout with one voucher. Recovery tests preserve once-only redemption and technical errors leave groups PENDING. See the regression report for actual totals. No live vouchers or AWS records were changed.

## Baseline file accounting

UNCHANGED means byte-identical to the user's initial workspace, not identical to Git HEAD. ADJACENT_CHANGE means this task modified that preexisting file for the integration work described in the changelog. No baseline file is missing.

| Repository-relative path | Status | Baseline SHA256 | Final SHA256 |
| --- | --- | --- | --- |
| `.github/workflows/deploy-main.yml` | ADJACENT_CHANGE | `66782309c8c7ef522db42fbc20e8ca56892943c98b53caafdbce720a92df0e22` | `f60fb64eec1cde8fcaa78da42c25bdeec8da67fc3350c9ff06cbb672bc1e52c7` |
| `.github/workflows/offline-checks.yml` | UNCHANGED | `8f74b3072ee2a54233e1dd40cfc66244d9c3313dc0fa708cc2bf8705c1679bda` | `8f74b3072ee2a54233e1dd40cfc66244d9c3313dc0fa708cc2bf8705c1679bda` |
| `FLASHRUSH-Serverless-Flash-Sale/backend/customer.py` | ADJACENT_CHANGE | `ee11c9e3a3f4eab5099402e15f821ab369517756af61d2bfc0728db9b9880dc9` | `65f0287b0cc627036e0f93a5efd0fdb54caa03679c09e11f1c2e9dbe1038754d` |
| `FLASHRUSH-Serverless-Flash-Sale/backend/test_customer.py` | UNCHANGED | `27a02abf87c11a35dc917ecca4b708f9b3e5650cd38f07f255e525ccf71f3130` | `27a02abf87c11a35dc917ecca4b708f9b3e5650cd38f07f255e525ccf71f3130` |
| `FLASHRUSH-Serverless-Flash-Sale/backend/test_vouchers.py` | UNCHANGED | `dfa598d196aabcf291d15574aa45e6e4c38a20f51fdc530391a21dd0656261eb` | `dfa598d196aabcf291d15574aa45e6e4c38a20f51fdc530391a21dd0656261eb` |
| `FLASHRUSH-Serverless-Flash-Sale/backend/vouchers.py` | UNCHANGED | `e977324008260acebc6dae5066c65143c8b8a9548e53968d44d8833baa3bbf64` | `e977324008260acebc6dae5066c65143c8b8a9548e53968d44d8833baa3bbf64` |
| `FLASHRUSH-Serverless-Flash-Sale/docs/operations/cart-voucher-checkout.md` | UNCHANGED | `478ec2eabe3fbafa344c713dba97d8ef16da64a26356c123b1fdca10bbf08100` | `478ec2eabe3fbafa344c713dba97d8ef16da64a26356c123b1fdca10bbf08100` |
| `FLASHRUSH-Serverless-Flash-Sale/docs/operations/vouchers.md` | UNCHANGED | `843b28f5b738697cffdb2b29c08b35226488c007f02eb67f463bad332a4034ae` | `843b28f5b738697cffdb2b29c08b35226488c007f02eb67f463bad332a4034ae` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/App.tsx` | UNCHANGED | `fc4f423078a7e25ce95e43895b3bbdf6ea3a83a36deb89ff8bab555d7ec28fb7` | `fc4f423078a7e25ce95e43895b3bbdf6ea3a83a36deb89ff8bab555d7ec28fb7` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/AdminVouchersPage.tsx` | UNCHANGED | `670a27af576668c87c4094fc6414b723a183262a174be4e4040f2de409fef4bb` | `670a27af576668c87c4094fc6414b723a183262a174be4e4040f2de409fef4bb` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/CartPage.tsx` | UNCHANGED | `c7989143689b972335a0aafb158067b661e6176edb03d8b5cc02b65888625af0` | `c7989143689b972335a0aafb158067b661e6176edb03d8b5cc02b65888625af0` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/CustomerAccountPage.tsx` | ADJACENT_CHANGE | `4eba0bd1135d5676b3a2265abe68d836ea38140ebb038fe88424dcf0b94bb8f1` | `e6a4e49fd8002dd3c542ea4deba47260468daf2c865ba1c242de60f60cc71f49` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/HomePage.tsx` | UNCHANGED | `90d964bd42dc016b52c724c5c0567f130db9fe49aaab00b4084eae5db4b49c02` | `90d964bd42dc016b52c724c5c0567f130db9fe49aaab00b4084eae5db4b49c02` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/customerService.test.ts` | ADJACENT_CHANGE | `5a93361efbe5cb80725d148468d630d0e5db78c92ef97c6c48811b28c0ba84f7` | `3bcc03788b28b6a63130a9f6c8dfbb29317a5767c937e097d1df27da2d62a9f7` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/services/customerService.ts` | ADJACENT_CHANGE | `47380355176ba7332e18eba38a593da4113bd4ac4087a9e9f3089937d7fdf874` | `73bc82e402985da6d1688323e58f1790cddf7014c397bb5a1d3910664b3b62fd` |
| `FLASHRUSH-Serverless-Flash-Sale/infrastructure/templates/customer-extension.json` | UNCHANGED | `2e9240ba7cd0688a18c3b82fbb5dcb8c0e20ddadaf87f48ef0cf34240d52c126` | `2e9240ba7cd0688a18c3b82fbb5dcb8c0e20ddadaf87f48ef0cf34240d52c126` |
| `FLASHRUSH-Serverless-Flash-Sale/infrastructure/templates/flashrush.json` | ADJACENT_CHANGE | `bef423380be067fefa7fbe4564a0af222fc9f745864f837b3612bcca1d9ff58d` | `9e72d011a7d927091dd91bc3a5a0d1a513affaec8be34b7c15881f3c041df776` |
| `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/customer_resources.py` | UNCHANGED | `5e3bcf0ea9d86d8d525aa36031277c2e6db75b541455f79a02474508268b9dc1` | `5e3bcf0ea9d86d8d525aa36031277c2e6db75b541455f79a02474508268b9dc1` |
| `FLASHRUSH-Serverless-Flash-Sale/scripts/deploy/test_lab.py` | ADJACENT_CHANGE | `4d963a4d6dd9b74143eca5d4661af649dee1d2cbc15246f529fc921739e8dc43` | `5434c92327392a4d2d33ecdadef03aa0b06a9944aad86b9f3d9018edef9e3069` |
| `FLASHRUSH-Serverless-Flash-Sale/scripts/ops/reconcile_pending.py` | ADJACENT_CHANGE | `e0398260cfffbe40343d4864941bbb17351d245c2c00f04c13269b476d57f4b2` | `813989f0c58e51fcfa4b1b822048c6a388f275c424938e5bbc2fb9523fbe0120` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/admin/VoucherPresetPanel.tsx` | UNCHANGED | `b2900929e98db9abab41ed7d438b85bf2a7835d93fbb6121eba22d265f138c9a` | `b2900929e98db9abab41ed7d438b85bf2a7835d93fbb6121eba22d265f138c9a` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/components/customer/VoucherWallet.tsx` | UNCHANGED | `1a6695167f02b8e7edf79e637cb0f7e65c8f314ee2cae8c097ca11204b62d76a` | `1a6695167f02b8e7edf79e637cb0f7e65c8f314ee2cae8c097ca11204b62d76a` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/pages/VouchersPage.tsx` | UNCHANGED | `b43e0aa7b485add0947cf5c86e45e6ddc31ead50c9a8e3461e410dfb75e8a630` | `b43e0aa7b485add0947cf5c86e45e6ddc31ead50c9a8e3461e410dfb75e8a630` |
| `FLASHRUSH-Serverless-Flash-Sale/frontend/src/styles/vouchers.css` | UNCHANGED | `7b7654f6904333321ec65f08de1e64480202eacb9c647bfd59f44cd073feb29d` | `7b7654f6904333321ec65f08de1e64480202eacb9c647bfd59f44cd073feb29d` |
| `FLASHRUSH-Serverless-Flash-Sale/scripts/ops/test_reconcile_pending.py` | ADJACENT_CHANGE | `daa38153f71e5c0757f566e87f26dddee2a88023f7ca3a1a03c5572bc2a9ee79` | `cb83997d89993b932ce7bf50abea83d034210bebdf47142cb11fceb00492040f` |
