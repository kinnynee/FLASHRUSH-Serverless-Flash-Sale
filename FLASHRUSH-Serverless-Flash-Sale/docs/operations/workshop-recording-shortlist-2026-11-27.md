# Workshop recording shortlist - 2026-11-27

The user selected a recording shortlist without changing the catalog. No
products, campaigns, orders, inventory or vouchers were modified by this check.
Existing test data remains available for inspection.

## Prepared links

- [Filtered in-stock catalog](https://d1jcrzj4650vey.cloudfront.net/products?status=ACTIVE&campaignId=flashrush-demo&availability=in-stock&pageSize=12)
- [Main product: Gaming Pro Wireless mouse](https://d1jcrzj4650vey.cloudfront.net/products/gaming-mouse-pro)
- [Backup: Sound Pro earbuds](https://d1jcrzj4650vey.cloudfront.net/products/wireless-earbuds)
- [Backup: Keychron K2 keyboard](https://d1jcrzj4650vey.cloudfront.net/products/keychron-k2)
- [Customer sign-in](https://d1jcrzj4650vey.cloudfront.net/auth)
- [Voucher wallet](https://d1jcrzj4650vey.cloudfront.net/account/vouchers)
- [Staff sign-in](https://d1jcrzj4650vey.cloudfront.net/staff/login)
- [Admin orders](https://d1jcrzj4650vey.cloudfront.net/admin/orders)
- [CloudWatch monitoring](https://d1jcrzj4650vey.cloudfront.net/admin/monitoring)

Campaign `flashrush-demo` (FLASHRUSH Demo) is active through **2026-12-02
13:01:32 UTC+7**. Use one unit of the selected product. Do not change the
campaign's schedule just to reproduce a recording; recheck eligibility if
recording later.

## Snapshot and proposed purchase

| Product | Price (VND) | Stock at check | FLASH10 discount | Expected total |
| --- | ---: | ---: | ---: | ---: |
| Gaming Pro Wireless | 590,000 | 9 | 59,000 | 531,000 |
| Sound Pro earbuds | 890,000 | 5 | 89,000 | 801,000 |
| Keychron K2 | 690,000 | 4 | 69,000 | 621,000 |

These are alternative single-product purchases, not a combined cart. FLASH10
requires at least VND 300,000, discounts 10% up to VND 100,000, and can be used
once per customer. It was enabled with 500 remaining uses and was not redeemed
by the demo customer at verification. STANDARD shipping currently costs zero;
payment is COD. Amounts above are calculated from current API prices and stored
voucher rules, not a newly submitted checkout quote. The checkout's live quote
is authoritative at recording time.

SAVE50K is a backup code for this selection: minimum spend VND 500,000 and a
fixed VND 50,000 discount. The demo customer had not redeemed it either. A new
completed checkout consumes a voucher use; refreshing or clearing browser
storage does not reset that per-customer limit.

## Recording sequence

1. Open the main product directly for a clean opening frame. Sign in as the
   demo customer before selecting Buy Now so the authenticated cart flow is used.
2. Show price, stock, countdown and quantity 1. Open the voucher wallet if needed.
3. Add the product, select only that cart line and apply FLASH10. Show the quote.
4. Continue to checkout, supply a demo delivery address, select STANDARD/COD,
   and verify the displayed total before the intentional recording purchase.
5. Submit once and show PENDING changing to the actual terminal result. Open
   customer order history and note the new order ID.
6. Switch to a separate staff tab and show that same ID in admin orders. Show
   monitoring afterwards; CloudWatch metrics can lag and are not instantaneous.

The filtered catalog showed exactly 11 in-stock products from the clean
campaign. All three detail pages loaded without browser errors and had enabled
Buy buttons. Local evidence: `.build/workshop-selected-products.json` and
`.build/workshop-selected-*.png`.

The filter changes the product grid only. Other campaign choices and categories
such as Verification, Lab or Monitoring Test can still appear in surrounding
controls, and admin/history retains test records. Start from the direct product
link when that surrounding data is unwanted in the frame; the site was not
globally cleaned or modified for this shortlist.
