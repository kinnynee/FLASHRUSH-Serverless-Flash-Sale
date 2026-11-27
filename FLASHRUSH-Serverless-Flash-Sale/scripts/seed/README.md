# Bộ chiến dịch mua sắm 2026–2027

> **Cập nhật 27/11/2026, 20:27 UTC+7:** Đã áp dụng đủ 20 chiến dịch lên `flashrush-lab-campaigns` trong account `303278700480`, region `us-east-1`. DynamoDB và API đều xác nhận tổng cộng 25 chiến dịch, gồm 5 chiến dịch cũ giữ nguyên và 20 chiến dịch mới UPCOMING. Đã triển khai riêng bản sửa selector trên Lambda API; chưa triển khai toàn bộ integration hardening. Giá và tồn kho không thay đổi. Xem [báo cáo triển khai](../../docs/operations/campaign-release-2026-11-27.md). Các ghi chú “chưa áp dụng/chưa deploy” bên dưới ghi lại trạng thái chuẩn bị trước lần triển khai này.

Đã chuẩn bị local, chưa áp dụng lên AWS. Dữ liệu mới gồm 20 chiến dịch, dùng 11 sản phẩm chính đã tồn tại và còn hàng tại thời điểm chụp snapshot. Không dùng sản phẩm load-test/telemetry hoặc loa Portable Mini đang hết hàng.

## Môi trường và bằng chứng

- Đích: account `303278700480`, region `us-east-1`, stack `flashrush-lab`.
- API: `https://7h0r2fxsha.execute-api.us-east-1.amazonaws.com`.
- Website tương ứng trong outputs local: `https://d1jcrzj4650vey.cloudfront.net`.
- Bảng đọc: `flashrush-lab-products`; bảng dự kiến chỉ thêm mới: `flashrush-lab-campaigns`.
- Không dùng môi trường `flashrush-manual` / API `56l39g5pqk`.
- `catalog-snapshot-2026-11-27.json`: chỉ chứa trường catalog/campaign công khai lấy bằng GET; không phải backup đầy đủ DynamoDB. Không chứa token, tài khoản khách hàng hoặc đơn hàng.
- Tết Đinh Mùi: mùng Một ngày **06/02/2027**, đã đối chiếu [Office Holidays](https://www.officeholidays.com/holidays/vietnam/tet-nguyen-dan) ngày 27/11/2026. Khoảng bán trước Tết và khai xuân là lịch biên tập, không phải thông báo lịch nghỉ chính thức.
- Black Friday 2027: 26/11 (sau thứ Năm thứ tư tháng 11); Cyber Monday: 29/11.

## Các giới hạn cần duyệt

1. Tại mốc 27/11/2026 12:00 UTC+7, cả **20 chiến dịch mới đều UPCOMING**. Không đạt mục tiêu 3–5 LIVE / 10–15 UPCOMING: chiến dịch cũ `flashrush-demo` đã giữ toàn bộ 12 sản phẩm chính đến 02/12/2026 13:01:32 UTC+7. Không thêm campaign LIVE chồng lên campaign này, không đổi dữ liệu cũ hoặc bổ sung sản phẩm chưa được duyệt.
2. Black Friday/Cyber Monday 2026 nằm trong cửa sổ cũ, nên bộ mới dùng kỳ năm 2027. Không tạo lịch sử 11.11 giả hoặc dời sự kiện sang ngày không đúng. Nếu cần demo nhiều chiến dịch LIVE ngay, cần duyệt riêng việc tái phân bổ campaign cũ hoặc thêm catalog phù hợp.
3. Đã sửa local `backend/app.py:public_product`: chọn ACTIVE trước, rồi UPCOMING có ngày bắt đầu gần nhất, cuối cùng ENDED có ngày kết thúc gần nhất. Nếu cùng thời điểm, dùng campaignId để kết quả ổn định. Dry-run local không còn selector blocker. **Chưa deploy bản sửa lên AWS**: phải triển khai và xác minh backend đích trước khi áp dụng dữ liệu. `readyToApply` chỉ đánh giá dữ liệu với logic local, không chứng minh AWS đã cập nhật hay thay thế việc duyệt.
4. Schema/API/frontend chưa có mô tả campaign. `description` là nội dung biên tập trong JSON local; seed chỉ ghi sáu trường được hỗ trợ, không ghi mô tả hoặc trạng thái. Tên, sản phẩm, thời gian và giới hạn mua được ghi theo schema hiện tại; trạng thái do backend suy ra. Mô tả chưa xuất hiện trong UI.
5. Dữ liệu không tạo mức giảm mới, voucher, vận chuyển hay quà miễn phí. Giá và tồn kho vẫn thuộc catalog hiện có. Giới hạn tất cả campaign là 1 sản phẩm/mỗi đơn theo semantics backend, không phải giới hạn theo tài khoản.
6. Kiểm tra local/Moto xác nhận schema, LIVE tại giờ mở bán, giới hạn mua và việc chọn đúng lịch ở khoảng trống giữa các đợt. Chưa seed nên chưa thể xác nhận hình ảnh/storefront/admin hiển thị bộ mới trên website thật. Dữ liệu test cũ vẫn còn nguyên trong danh sách.

## File và kiểm tra

- `campaigns-2026.json`: tên, mô tả biên tập, ID ổn định, lịch có UTC+7, liên kết sản phẩm.
- `campaigns.py`: mặc định chỉ preview từ snapshot; phát hiện thiếu sản phẩm, trùng ID, khác biệt với ID có sẵn, chồng lịch (kể cả trùng đúng thời điểm kết thúc) và lỗi selector.
- `campaign-review.json`: báo cáo tại mốc duyệt cố định; `errors=[]`, `warnings=[]`, `selectorBlockers=[]` và `readyToApply=true` cho logic local đã sửa.
- `test_campaigns.py`: test dữ liệu, chạy lại không tạo mới, giữ nguyên chỉnh sửa admin, thiếu sản phẩm, trùng biên thời gian, ID/quantity sai và kiểm chứng bằng backend/Moto.

Từ Git root, chạy preview và test:

```powershell
.venv/Scripts/python -B FLASHRUSH-Serverless-Flash-Sale/scripts/seed/campaigns.py --at 2026-11-27T12:00:00+07:00 --report FLASHRUSH-Serverless-Flash-Sale/scripts/seed/campaign-review.json
.venv/Scripts/python -B -m unittest discover -s FLASHRUSH-Serverless-Flash-Sale/scripts/seed -p 'test_*.py' -v
```

Preview trả mã thoát 2 khi có blocker; đó là kiểm tra an toàn hoạt động đúng. Bỏ `--at` để đánh giá theo giờ thật, nhưng snapshot vẫn là dữ liệu lịch sử. Không dùng snapshot như bằng chứng tồn kho hiện tại.

## Lệnh áp dụng sau khi duyệt và giải quyết blocker

**Chưa chạy lệnh này. Chỉ chạy sau khi duyệt dữ liệu, deploy và xác minh bản sửa selector trên backend đích. Script không tự xác minh phiên bản Lambda đang chạy.**

```powershell
.venv/Scripts/python -B FLASHRUSH-Serverless-Flash-Sale/scripts/seed/campaigns.py --apply --profile dropit-admin --account 303278700480 --region us-east-1 --stack flashrush-lab
```

Khi được phép, script kiểm tra STS, ownership/outputs của stack, đọc lại hai bảng rồi kiểm tra toàn bộ plan theo thời gian thật. Không tự chuyển mốc ngày đã duyệt. Ghi mới bằng một DynamoDB transaction có điều kiện `attribute_not_exists(campaignId)` và kiểm tra sản phẩm còn tồn tại. Không update/delete campaign cũ, không ghi bảng Products/Orders, không sửa giá/tồn kho. ID tồn tại và giống hệt được bỏ qua; khác nội dung thì chặn toàn bộ.

Cần tạm ngừng chỉnh campaign từ admin trong lúc áp dụng: DynamoDB transaction không khóa kết quả scan để chống một writer khác thêm campaign mới chồng lịch. Nếu transaction lỗi thì không ghi một phần; đọc lại/dry-run trước khi chạy lại. Tài khoản operator cần quyền đọc STS/CloudFormation, Scan hai bảng và PutItem campaign/ConditionCheckItem sản phẩm tương ứng; không tự sửa IAM.

Sau áp dụng được duyệt, kiểm tra GET campaigns/products và UI desktop/mobile cho thời gian UTC+7, countdown, số sản phẩm và giới hạn. Không đặt đơn thử hay thay đổi tồn kho trong phạm vi chuẩn bị dữ liệu này.

## Bảng duyệt

Bảng đầy đủ ở [campaign-table.md](campaign-table.md). Tất cả thời gian là giờ Việt Nam UTC+7; trạng thái đánh giá tại 27/11/2026 12:00.
