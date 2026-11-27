# Main integration verification - 2026-11-27

Integrated local ecommerce hardening, voucher wallet/presets, restored storefront
banner and campaign release notes with upstream admin UI PR #20 (`7a17361`).
The original local changes are preserved in `2010f85` before the merge.

## Conflict resolution

`AdminVouchersPage.tsx` was the only textual conflict. The merged page retains
the upstream header, refresh control, search toolbar, status badges, empty state
and editor, plus local voucher presets and creation of missing codes only.
Staff authentication remains bearer-token based; the upstream error helper now
directs operators to staff login instead of the removed API-key control.
Historical order-price handling and missing-revenue notices remain intact.

A browser check also exposed the desktop sidebar height overriding the mobile
rule. A narrow-screen override removes the empty vertical space without changing
desktop layout. The restored homepage banner and four campaign tabs remain.

## Verification

- Backend: 76 tests passed.
- Deployment/configuration: 20 tests passed.
- Operations: 5 tests passed; campaign seeds: 7 tests passed.
- Frontend after merge: 80 tests passed; ESLint passed.
- HTTP and mock production builds passed.
- Browser: merged voucher header/search, create only missing presets, edit/save,
  overview/products/orders rendering, and warehouse voucher denial passed.
- Mobile admin sidebar height was approximately 288px at 390px viewport width;
  restored homepage loaded without horizontal overflow.

Browser admin API responses and all writes were intercepted locally. This does
not establish live AWS compatibility for the full hardening release. Evidence is
kept locally under `.build/merge-admin-verification/`.

The earlier remediation reports describe their original verification checkpoint.
This integration supersedes their statements about uncommitted source state and
the unchanged admin voucher page. It does not supersede their live AWS limits.
Committing and pushing source does not deploy it: AWS deployment remains an
explicit `workflow_dispatch` action.
