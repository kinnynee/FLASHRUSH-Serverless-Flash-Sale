# Khách hàng, tồn kho và phân quyền

## Bản phát triển local

Đã thêm các màn hình /account, /admin/customers, /admin/users, /admin/inventory và backend business.py. API đã deploy lên stack flashrush-lab ngày25/11/2026, sử dụng CustomerPool/CustomerClient hiện có, không tạo pool trùng. Frontend hiện chạy local; chưa push source hoặc publish frontend mới lên CloudFront. Các routes /me và checkout2.0 từ backend đang chạy đã giữ trong customer.py.

Khách đăng ký, xác nhận email, đăng nhập, quên/đặt lại mật khẩu, đăng xuất; xem các đơn tạo sau khi đăng nhập. Đơn khách vãng lai vẫn dùng bearer order token hiện có. Chưa migrate đơn cũ sang tài khoản; không suy ra chủ đơn từ browser hoặc email tự khai. Token đăng nhập lưu sessionStorage, không lưu mật khẩu hoặc refresh token; hết phiên cần đăng nhập lại.

## Vai trò

| Nhóm | Quyền |
|---|---|
| Khách hàng | Tài khoản và đơn của mình |
| support | Xem/sửa họ tên khách hàng, đọc overview/orders |
| warehouse | Xem tồn kho, điều chỉnh kho và lịch sử |
| manager | Quản trị sản phẩm, chiến dịch, đơn, khách, kho, monitoring; không phân quyền user |
| owner | Quản trị nhân viên/phân quyền và các nghiệp vụ khác |

Backend gọi Cognito GetUser để kiểm tra access token, đối chiếu sub/enabled bằng AdminGetUser của đúng User Pool, đọc nhóm hiện tại mỗi request. Không tin role từ form hoặc JWT chưa xác minh. Self-signup không cấp staff role. Không được đổi quyền/khóa chính mình hoặc owner qua API. Mời nhân viên qua Cognito gửi email, đổi mật khẩu lần đầu. Owner đầu tiên chỉ được cấp từ công cụ AWS của người vận hành; không có API tự nâng quyền.

API key admin cũ vẫn là đường quản trị đặc quyền tương thích trong giai đoạn chuyển tiếp, không phát cho nhân viên. Thu hồi luồng legacy sau khi đã nghiệm thu Cognito nếu chuyển hoàn toàn. Proxy local chỉ chèn legacy key khi không có bearer, không nâng quyền request có token.

## Kho

POST /admin/inventory/adjustments: productId, delta nguyên khác0 trong[-10000,10000], reason3..500ký tự, requestId UUID. Transaction gồm thay đổi stock với điều kiện không âm và ghi movement journal có actorId. Cùng requestId/payload chỉ ghi một lần; khác payload trả409. Request chưa rõ kết quả được giữ trong sessionStorage để retry cùng ID. Lịch sử hiện trả200 điều chỉnh gần nhất, có thể lọc productId; đây là lịch sử điều chỉnh thủ công, không phải sổ kho đầy đủ mọi giao dịch bán hàng. Scan chỉ phù hợp quy mô lab; cần GSI/query/pagination trước khi mở rộng.

PATCH sản phẩm không nhận stockDelta nữa: dùng trang Tồn kho để có reason/journal. Tồn kho ban đầu chỉ khai khi tạo sản phẩm. Worker bán hàng giữ transaction cũ, không sửa status/stock rời để phục hồi.

## Triển khai có chủ đích

1. Giữ backup code/config. Chọn account, region, namespace đúng. Công cụ mới mặc định dry-run:

```powershell
python scripts/ops/setup_business.py --profile dropit-admin --region us-east-1 --account 303278700480 --namespace flashrush-lab
```

2. Thêm --execute để tạo User Pool/client/groups, bảng journal, IAM scoped, environment và routes mới. Không chạy lệnh này trên cùng tài nguyên đang được CloudFormation quản lý nếu chưa thống nhất ownership: track stack nên dùng template/generator đã bổ sung thay vì tạo thủ công tài nguyên trùng tên. Script không reset stock, không tự tạo/mời tài khoản owner.
3. Deploy backend với đủ app.py, monitoring.py, business.py. Hai packagers đã cập nhật; CI manual chỉ deploy code/site, không tự provision các dependencies mới.
4. Sau khi backend có kiểm tra Cognito, với track manual có thể thêm --enable-bearer-admin vào setup để chuyển các routes admin cũ AWS_IAM sang NONE tại Gateway. Backend vẫn xác thực bearer và phân quyền. Không đổi route trước khi xác nhận backend mới. Với track CloudFormation, cập nhật AuthorizationType của routes cũ có chủ đích trong stack; tránh Console drift.
5. Đăng ký/xác nhận email thật qua /account. Cấp owner cho tài khoản đã xác nhận bằng cùng script --execute --owner-email EMAIL. Không cần tạo user duplicate hoặc tự gán owner từ frontend.
6. Build/upload frontend; thêm /account vào CloudFront SPA rewrite, invalidation. Generator đã thêm route account trong Function. Các distributions manual hiện có cần cập nhật Function khi triển khai.
7. Kiểm tra customer/warehouse/support/manager/owner bằng các phiên riêng; thử403 khi trái quyền, khóa user, token hết hạn, stock âm, duplicate request. Chụp bằng chứng thật sau khi chạy. Không lấy unit test làm bằng chứng live.

Cognito thêm một dịch vụ AWS so với kiến trúc9dịch vụ ban đầu; cập nhật Workshop/billing/inventory khi deploy. Email xác nhận/invitation cần kiểm tra quota Cognito. Đã thêm bảng Business, các nhóm Cognito và routes bằng CloudFormation, không xóa/thay thế tài nguyên cũ. Chưa gửi email mời, chưa tạo tài khoản người dùng mới.

## Kiểm tra

Backend test_business.py kiểm tra role matrix, identity từ Cognito, không nâng quyền đăng ký, bảo vệ owner, kho nguyên tử/idempotency/không âm. Kiểm thử app cũ cập nhật yêu cầu điều chỉnh kho có journal. Frontend kiểm tra auth headers, server denial, không lưu mật khẩu. Build production kiểm tra TypeScript. Đã kiểm tra live GET các tab200 qua proxy, không xác thực401. Kiểm tra nhập2/replay cùng ID vẫn stock2, xuất3 bị409, xuất2 còn0 trên SKU test riêng; dữ liệu sản phẩm khác không đổi. Chưa kiểm thử đăng ký/email/mời nhân viên thật.

## Bằng chứng triển khai

`.build/business-release-20261125/`: before-api.zip, before-template.json, proposed-template.json, change-set.json, read-smoke.json, inventory-smoke.json. SKU kiểm thử inventory-api-check-4c8a73b2 giữ tồn0 và hai movement để đối chiếu. Không dùng dữ liệu này làm số bán thực. Truy cập customer hiện có vẫn dùng Gateway JWT; admin cũ giữ AWS_IAM. Proxy local ký IAM, chuyển bearer khách thành X-User-Token nội bộ để backend xác minh mà không bị SigV4 ghi đè. Frontend trên domain cần cơ chế Gateway Cognito được thiết kế riêng nếu chuyển hoàn toàn sang staff roles; chưa bỏ bảo vệ IAM.
