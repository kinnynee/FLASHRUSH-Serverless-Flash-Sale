# Voucher và tồn kho

- `/admin/vouchers`: tạo, sửa, bật/tắt mã. Quyền owner/manager; hỗ trợ API key quản trị hiện có.
- Giảm theo phần trăm hoặc số tiền, đơn tối thiểu, trần giảm, thời hạn, tổng lượt dùng.
- Mỗi tài khoản dùng một lần mỗi mã. Khách đăng nhập, chọn sản phẩm trong giỏ rồi áp dụng mã.
- Máy chủ tính giá theo giỏ hiện tại; không tin giá giảm từ trình duyệt.
- Xác nhận đơn, trừ kho và ghi nhận lượt dùng trong cùng giao dịch DynamoDB. Đơn thất bại không tiêu hao voucher; xử lý lại không trừ thêm.
- Sửa voucher sau khi nhận đơn nhưng trước khi xử lý khiến đơn chờ đó thất bại; khách cần đặt lại theo điều kiện mới.
- Không tạo mã khuyến mãi thật tự động.
- Tồn kho dạng bảng, tìm kiếm, điều chỉnh và lịch sử nhập/xuất.

## API

- `GET /admin/vouchers`
- `POST /admin/vouchers`
- `PATCH /admin/vouchers`: gửi đầy đủ cấu hình cùng version hiện tại.
- `POST /me/vouchers/quote`: JWT khách hàng; body code và lineIds.
- `POST /me/checkouts`: thêm voucherCode tùy chọn; giữ nguyên Idempotency-Key và payload khi thử lại.

## Kiểm thử

Backend Moto kiểm tra giới hạn lượt, hai đơn cạnh tranh lượt cuối, xử lý lặp, thiếu kho, thay đổi cấu hình, số tiền cố định và một lần mỗi khách. Kiểm thử này không thay thế luồng mua bằng tài khoản thật trên AWS.
