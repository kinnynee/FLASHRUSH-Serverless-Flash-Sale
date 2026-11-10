FLASHRUSH — System Overview & MVP Scope
Tên dự án: Building a High-Concurrency Serverless Flash Sale System on AWS
Tài liệu: System Overview / Business Analysis Baseline
Phiên bản: 1.1 — Revised Draft, pending team approval
Ngày cập nhật: 10/11/2026
Jira: SCRUM-6 — Chốt scope MVP, kiến trúc và giới hạn AWS
Đối tượng đọc: Nhóm FLASHRUSH (4 thành viên đang tham gia Sprint 1; kế hoạch 5), reviewer FCAJ và người tự thực hành workshop.
Đầu vào sửa đổi: system-overview.md v1.0; checklist Danh sách những gì nhóm FLASHRUSH cần sửa; sơ đồ Flash_Sale_Architecture_Updated.drawio (Architecture v1.1).
0. Trạng thái, phạm vi hiệu lực và kiểm soát thay đổi
Trạng thái: REVISED DRAFT — CHƯA ĐƯỢC PHÊ DUYỆT. Bản 1.1 xử lý 5 vấn đề P0 trong checklist và bổ sung contract để có thể giao việc cho SCRUM-9/10/11. Các cấu hình, ngưỡng thời gian và lựa chọn trong mục ADR là đề xuất triển khai cho MVP, không được diễn giải thành quyết định đã ký duyệt hoặc tính năng đã chạy trên AWS.
Nhãn
Ý nghĩa
Agreed direction
Mục tiêu không overselling, serverless/event-driven, 9 dịch vụ AWS, phạm vi workshop demo
Proposed for review
Lưu PENDING, key idempotency, giao thức enqueue/recovery, hạn chế API công khai, cấu hình hàng đợi và nguồn metrics
Pending validation
Khả năng cấp quyền AWS, cấu hình thực tế, benchmark 100/10, chi phí, screenshots và kết quả chạy
Approved
Chỉ gắn nhãn sau khi nhóm review, ghi quyết định vào Jira và cập nhật Approval Log tại mục 15

Nguyên tắc kiểm soát: thay đổi về API, message schema, khóa DynamoDB, logic terminal state, trạng thái enqueue, quyền hoặc chi phí phải có review của chủ sở hữu liên quan. Không ghi kết quả kiểm thử/chi phí mô phỏng dưới dạng kết quả thật.
Phân biệt phạm vi: Hệ thống ứng dụng sử dụng 9 dịch vụ AWS ở mục 5.1. Công cụ quản trị billing như AWS Budgets/Pricing Calculator là quy trình quản trị tài khoản, không được tính nhầm vào 9 khối kiến trúc ứng dụng. Script đối soát chạy thủ công trong lab; không mặc nhiên thêm EventBridge hoặc một dịch vụ mới.
1. Executive Summary
FLASHRUSH là ứng dụng thương mại điện tử mô phỏng các đợt Flash Sale có hàng tồn kho giới hạn. Điểm khác biệt của sản phẩm không nằm ở số lượng tính năng bán hàng, mà ở khả năng tiếp nhận các yêu cầu đặt mua đồng thời, xử lý bất đồng bộ và bảo đảm không xác nhận số lượng vượt tồn kho khả dụng.
Người mua tương tác với một website React được phân phối qua Amazon CloudFront và Amazon S3. Yêu cầu mua được gửi tới Amazon API Gateway, chuyển vào AWS Lambda Order API và Amazon SQS. Một Lambda Order Worker xử lý yêu cầu và sử dụng giao dịch có điều kiện của Amazon DynamoDB để quản lý tồn kho và trạng thái đơn. Amazon CloudWatch, Amazon SNS và AWS IAM hỗ trợ quan sát, cảnh báo và phân quyền.
Workshop FCAJ trình bày quy trình tự thực hành, kiến trúc, cấu hình, mã nguồn, kiểm thử, chi phí và cleanup. Thanh toán và tích hợp sàn thương mại điện tử thật không thuộc MVP.
1.1. Business problem
Trong Flash Sale, nhiều người có thể đặt cùng một sản phẩm vào thời điểm gần như đồng thời. Nếu mỗi request đọc tồn kho rồi trừ theo logic độc lập, hệ thống có thể gặp race condition và xác nhận nhiều đơn hơn số hàng thực có (overselling). Bên cạnh đó, request HTTP có thể bị gửi lại, SQS Standard có thể giao lại thông điệp và Lambda có thể bị retry khi xảy ra lỗi.
1.2. Value proposition
Giữ tính đúng đắn tồn kho trước mức độ đồng thời cao.
Tách bước tiếp nhận yêu cầu khỏi bước xác nhận mua hàng.
Có trạng thái đơn hàng minh bạch cho người dùng.
Cho phép diễn tập retry, DLQ, logs, alarms và cleanup.
Có kiến trúc và mã nguồn đủ rõ để người khác triển khai lại trong môi trường lab được cấp phép.
2. Project Goals, Success Metrics & Constraints
2.1. Mục tiêu
ID
Mục tiêu
Cách xác minh
G-01
Không xác nhận bán vượt tồn kho
Đối chiếu tổng lượng đã xác nhận và tồn kho trong DynamoDB sau load test
G-02
Xử lý bất đồng bộ có trạng thái rõ ràng
Kiểm tra POST /orders và GET /orders/{orderId}
G-03
Chống tác động của request/message trùng
Replay cùng idempotency key và cùng SQS message
G-04
Có cơ chế quan sát và xử lý sự cố
CloudWatch Logs/Metrics/Alarm, SQS DLQ, cảnh báo SNS
G-05
Dễ thực hành lại theo workshop
Người khác làm được từ tài liệu Markdown, code và checklist
G-06
Kiểm soát chi phí lab
Ước tính trước, budget alerts, cleanup, xem chi phí thực tế

2.2. Kịch bản kiểm thử tiêu biểu
Giả định kiểm thử: một productId, initialStock = 10, 100 yêu cầu mua hợp lệ, mỗi yêu cầu có quantity = 1 và idempotency key duy nhất.
Kết quả kỳ vọng khi tất cả 100 yêu cầu được tiếp nhận, xử lý xong và không còn lỗi treo:
Tối đa 10 đơn CONFIRMED (đích kiểm thử là chính xác 10).
90 yêu cầu còn lại có thể nhận OUT_OF_STOCK khi toàn bộ yêu cầu hoàn tất và không có lỗi kỹ thuật khác.
finalStock = 0 nếu đúng 10 đơn thành công.
Không có đơn trùng hoặc trừ tồn kho hai lần.
Invariant kiểm thử: khi không có nhập thêm hàng, stockCuối = stockĐầu - Σ(quantity của các đơn CONFIRMED duy nhất), và stockCuối >= 0. Với 100 yêu cầu, quantity=1 và stockĐầu=10, chỉ kỳ vọng đúng 10/90 nếu tất cả 100 yêu cầu độc lập được tiếp nhận và đi tới trạng thái cuối hợp lệ.
Lưu ý: số lượng HTTP 202 Accepted chỉ xác nhận tiếp nhận để xử lý; không dùng làm số đơn mua thành công. Nếu có request bị từ chối, timeout hoặc lỗi vận hành, phải báo cáo kết quả thực tế riêng và không tuyên bố 10/90 là đã đạt.
2.3. Các ràng buộc
Thực hiện trên tài khoản AWS của nhóm được cấp quyền hợp lệ, ưu tiên Region us-east-1 sau khi kiểm tra khả năng sử dụng dịch vụ.
Không dùng Amazon Bedrock.
Ngân sách thí nghiệm mục tiêu dưới 5 USD (mục tiêu quản trị, không phải báo giá hoặc cam kết).
Không tích hợp thanh toán thật, không thực hiện mua hàng thật trên Shopee/Lazada.
Không lưu dữ liệu cá nhân thật của khách hàng trong bản demo.
Không chia sẻ tài khoản root, access key hoặc secret trong repo, tài liệu, ảnh và log.
3. Stakeholders & Responsibilities
Stakeholder
Quan tâm chính
Quyền quyết định / trách nhiệm
Project Lead / Cloud Architect
Phạm vi, architecture, IAM, cost
Điều phối review, duy trì tài liệu SCRUM-6 và SCRUM-8
Backend/API Owner
Contract và xử lý HTTP
API contract, validation, order status API
Database & Queue Owner
Consistency, worker, retries
DynamoDB schema, SQS message contract và transaction
Frontend Owner
Trải nghiệm mua hàng
React UI, loading/error/states, S3/CloudFront
QA & Observability Owner
Test, evidence, metrics
Test cases, CloudWatch/SNS, báo cáo đo và workshop
Workshop learner / reviewer FCAJ
Tính tái hiện, tính đúng kỹ thuật
Thực hiện hướng dẫn, kiểm chứng output và cleanup

RACI chi tiết và người nhận Epic sẽ chốt khi đủ 5 thành viên. Không tự suy luận năng lực hoặc xác nhận phân công dài hạn từ việc chia Task Sprint 1 tạm thời.
4. MVP Scope
4.1. In scope — phạm vi phải triển khai
ID
Nhóm chức năng
Nội dung / giới hạn
M-01
Catalog
Xem danh sách và chi tiết sản phẩm demo, GET /products và GET /products/{productId}
M-02
Stock demo
Có thể seed một sản phẩm với stock=10; không thay đổi stock thủ công khi bài test 100/10 đang chạy
M-03
Order intake
Validate request và idempotency; tạo Orders=PENDING có điều kiện; gửi SQS và trả 202 khi SQS ACK
M-04
Async worker
SQS Standard → Lambda event source mapping → DynamoDB
M-05
Không overselling
Products.stock giảm cùng thao tác chuyển Orders sang CONFIRMED trong một transaction
M-06
Order status
GET /orders/{orderId} bằng token của yêu cầu; trạng thái PENDING, CONFIRMED, OUT_OF_STOCK, FAILED
M-07
Duplicate control
Một key + cùng payload chỉ tương ứng một orderId; cùng key + payload khác trả 409; message trùng no-op
M-08
Recovery
Retry/throttling/conflict có giới hạn; enqueue recovery và phát hiện PENDING treo; DLQ + runbook
M-09
Observability
Logs, metric có nguồn dữ liệu rõ ràng, CloudWatch Alarms, SNS email alert
M-10
Deployment/security
React, S3 private, CloudFront OAC, HTTPS, API Gateway throttling và IAM least privilege
M-11
Evidence & handoff
Test 100 yêu cầu tranh mua 10 sản phẩm, screenshots/log thật, tài liệu Hugo song ngữ, cleanup

4.2. Out of scope
Thanh toán thật (MoMo/VNPAY), thu thập địa chỉ giao hàng, vận chuyển, hoàn tiền và xử lý đơn hàng thương mại thực tế.
Đồng bộ Shopee/Lazada, quản lý người bán, recommendation engine, AI/ML/Bedrock.
Cognito và hệ thống tài khoản người dùng hoàn chỉnh; không khẳng định đã có phân quyền theo khách hàng như production.
Multi-region, SLA thương mại, hệ thống hàng triệu người dùng, quản trị kho ngoài luồng test.
Admin API công khai có quyền đổi stock, redrive DLQ hoặc đọc thông tin nhạy cảm.
Hệ thống tự động reconciliation luôn chạy 24/7 (MVP dùng script vận hành có kiểm soát ở mục 8.5).
4.3. MoSCoW & giao diện mẫu
Must: M-01 → M-08, bảo mật/deployment cơ bản và bằng chứng kiểm thử cốt lõi.
Should: CloudWatch/SNS, My Orders lưu danh sách orderId ở trình duyệt, guide song ngữ.
Could: Admin Dashboard và System Monitoring chế độ demo, có nhãn “Dữ liệu mô phỏng” nếu chưa tích hợp API thật.
Won't (MVP): các mục 4.2.
Quy ước UI cho SCRUM-12: thương hiệu FLASHRUSH; flow Homepage → Product Detail → Checkout → Processing → Result. Checkout không có thanh toán/địa chỉ/vận chuyển. Màn Processing hiển thị đang chờ, không hiển thị “đã giữ hàng”; Result có CONFIRMED, OUT_OF_STOCK, FAILED. My Orders đọc từ danh sách orderId/token được lưu tại trình duyệt, không mặc định có API liệt kê đơn theo tài khoản. Các nút Admin không có backend phải bị vô hiệu hóa hoặc dán nhãn demo; dashboard mock phải ghi rõ là mô phỏng. Prototype cần desktop/mobile và thống nhất dữ liệu mẫu giữa các màn hình.
5. High-Level Architecture
5.1. Chín dịch vụ AWS, vai trò và lý do chọn
#
Dịch vụ AWS
Vai trò
Lý do lựa chọn / nguyên tắc triển khai
1
Amazon S3
Lưu frontend React đã build và assets tĩnh
Static hosting không cần server; dùng bucket private + Block Public Access
2
Amazon CloudFront
Phân phối website qua HTTPS
Cache/CDN, kết hợp Origin Access Control (OAC) truy cập S3 không public
3
Amazon API Gateway
HTTP API catalog / order intake / order status
Gateway chung cho route, CORS và throttle kiểm soát lưu lượng
4
AWS Lambda
Order API và Order Worker
Compute theo sự kiện, không tự quản lý máy chủ
5
Amazon SQS
Main Standard Queue + Dead-Letter Queue
Tách intake khỏi worker, hỗ trợ at-least-once delivery và retry/DLQ
6
Amazon DynamoDB
Products và Orders; conditional writes + transaction
Điều kiện ghi nguyên tử giúp ngăn overselling và double decrement
7
Amazon CloudWatch
Logs, metrics, alarms
Theo dõi API/worker/queue và cung cấp bằng chứng kiểm thử
8
Amazon SNS
Nhận alarm và gửi email
Thông báo sự cố queue/DLQ/worker nhanh cho nhóm vận hành
9
AWS IAM
Role và policy theo service
Giới hạn quyền DynamoDB/SQS/CloudWatch theo least privilege

5.2. Luồng logic chuẩn để thống nhất với Architecture v1.1
Browser/React -- GET website --> CloudFront -- OAC --> Private S3
      |
      | HTTPS API (trực tiếp, không phải CloudFront reverse proxy trong MVP)
      v
API Gateway -- POST /orders --> Lambda Order API
      |                            |
      |                            +-- (1) Conditional Put Orders=PENDING,
      |                            |       enqueueState=NOT_SENT
      |                            +-- (2) Acquire enqueue lease
      |                            +-- (3) SQS SendMessage(orderId)
      |                            +-- (4) ACK -> 202, error/uncertain -> 503 + recovery
      |                            |
      |                            v
      |                         SQS Standard Queue
      |                            | Lambda event source mapping/poll
      |                            v
      |                         Lambda Order Worker
      |                            |
      |                            +-- TransactWriteItems:
      |                            |     Products: stock -= quantity IF stock >= quantity
      |                            |     Orders: PENDING -> CONFIRMED IF status=PENDING
      |                            +-- OOS verified: Orders -> OUT_OF_STOCK
      |                            +-- retryable error: retry -> DLQ if exhausted
      |
      +-- GET /products -------------------------------> Lambda Order API -> Products (read)
      +-- GET /products/{productId} -------------------> Lambda Order API -> Products (read)
      +-- GET /orders/{orderId} + X-Order-Token -------> Lambda Order API -> Orders (read)

CloudWatch: API/Worker logs, SQS/Lambda/API metrics -> Alarms -> SNS email.
IAM: roles/policies áp dụng trên các tài nguyên, KHÔNG là request hop.
Recovery CLI (operator only) -> DynamoDB Orders scan/conditional lease -> SQS resend.
Lưu ý về đơn PENDING: được tạo bởi Order API, không phải Worker. Worker chỉ cập nhật đơn đã tồn tại; không dùng Put CONFIRMED để ghi mới khi xác nhận. GET /orders/{orderId} đọc từ Orders. Trạng thái “Đang xử lý” trên UI có thể dựa vào PENDING, không bắt buộc lưu PROCESSING thành trạng thái riêng trong MVP. Mô tả này là proposed architecture, cần SCRUM-9/10/11 phê duyệt cùng .drawio trước khi code.
5.3. Reliability boundaries
Single AWS account / Region đề xuất, us-east-1 cần kiểm tra điều kiện tài khoản (SCRUM-8).
SQS Standard có thể giao trùng và không bảo đảm thứ tự; Worker phải idempotent.
DynamoDB transaction không bao gồm SQS SendMessage; phải có enqueue-state + recovery ở mục 8.
Chỉ dùng 2 bảng Products, Orders; không thêm RDS/EC2. Script đối soát thực hiện trên máy người vận hành trong lab, không thêm service vào kiến trúc AWS.
DynamoDB on-demand là lựa chọn ban đầu; chi phí và quota xác nhận trong SCRUM-8.
Không đặt Lambda trong VPC nếu không có yêu cầu private network cụ thể; đánh giá lại nếu thiết kế thay đổi.
6. User Journeys & Functional Requirements
6.1. Luồng người dùng
Mở React app, chọn sản phẩm demo; mỗi lần test tạo một Idempotency-Key UUIDv4 ngẫu nhiên và lưu ở sessionStorage trước khi gửi request.
POST /orders gồm Idempotency-Key trong HTTP header và body {productId, quantity}; retry của cùng thao tác phải dùng lại đúng key + payload.
API kiểm tra request, tạo Orders=PENDING có điều kiện, enqueue SQS; chỉ trả 202 Accepted sau ACK thành công từ SQS. Khi chưa xác định thành công, trả lỗi có thể retry cùng key, không được tự tạo key mới.
Khi nhận 202 (hoặc 200 do replay với đơn đã terminal), frontend lưu orderId; 202 không có nghĩa đã mua thành công.
Frontend poll GET /orders/{orderId} với X-Order-Token (giá trị chính là key bí mật của lần mua trong MVP demo); hiển thị trạng thái thực từ Orders.
UI dừng poll ở CONFIRMED, OUT_OF_STOCK, FAILED; khi chờ quá lâu thì hiển thị “Chưa có kết quả — thử kiểm tra lại” thay vì tự kết luận thất bại.
6.2. Functional requirements
ID
Yêu cầu
Điều kiện nghiệm thu
FR-01
Catalog
GET /products trả mảng rỗng hợp lệ khi không có sản phẩm
FR-02
Product detail
GET /products/{productId} 200 hoặc 404, stock được hiểu là snapshot
FR-03
Intake
Validate body/key; ghi PENDING, enqueue và chỉ trả 202 khi SQS ACK
FR-04
Order status
GET /orders/{orderId} trả trạng thái thực, yêu cầu order token
FR-05
Inventory
Transaction có điều kiện, stock cuối không âm và khớp số đơn confirmed
FR-06
Request duplicate
Same key + same payload -> same orderId; same key + different payload -> 409
FR-07
Message duplicate
Duplicate/retry không trừ kho hai lần và không đổi terminal state
FR-08
Failure recovery
Detect/reconcile PENDING quá hạn, phân loại lỗi, DLQ + cảnh báo
FR-09
UI state
202 và PENDING không hiển thị thông báo đã giữ hàng hoặc mua thành công
FR-10
Observability
Có correlationId/orderId không nhạy cảm, chỉ số có nguồn rõ
FR-11
Security
HTTP throttling, token bảo vệ Order GET, không public admin mutation
FR-12
Cleanup
Có inventory tài nguyên, hướng dẫn xóa và bằng chứng kiểm tra sau lab

6.3. API contract v1.1 — đề xuất cho SCRUM-9 review
Method
Endpoint
Input/điều kiện chính
Response chính
Các lỗi
GET
/products
Không bắt buộc xác thực trong lab
200 {items:[...]} (có thể rỗng)
429, 500, 503
GET
/products/{productId}
productId hợp lệ
200 product object
400, 404, 429, 5xx
POST
/orders
Header Idempotency-Key: <UUIDv4>; body JSON
202 nếu đã enqueue; 200 nếu cùng key và đơn terminal
400, 404, 409, 429, 503, 500
GET
/orders/{orderId}
Header X-Order-Token: <idempotency-key> (chỉ MVP)
200 status object
400, 403/404, 429, 5xx

Product schema (ví dụ, phải đồng bộ với frontend):
{"productId":"SKU-001","name":"Tai nghe FLASHRUSH Demo","priceVnd":199000,"stock":10}
POST /orders — request v1.1:
```http
POST /orders HTTP/1.1
Content-Type: application/json
Idempotency-Key: e7b8cfe9-c9fa-45d1-a34b-d4c70240ea6c


{"productId":"SKU-001","quantity":1}
```

202 Accepted — chỉ sau khi enqueue đã được SQS ACK:
{"orderId":"ord_e87ffcabafcd1bb864f91f897647a177","status":"PENDING","statusUrl":"/orders/ord_e87ffcabafcd1bb864f91f897647a177","accepted":true}
GET /orders/{orderId} — response minh họa:
{"orderId":"ord_e87ffcabafcd1bb864f91f897647a177","productId":"SKU-001","quantity":1,"status":"CONFIRMED","updatedAt":"2026-11-10T07:00:00Z"}
Lỗi API dùng envelope thống nhất:
{"error":{"code":"ORDER_NOT_QUEUED_YET","message":"Chưa xác nhận được việc tiếp nhận. Hãy thử lại với cùng Idempotency-Key.","retryable":true},"requestId":"req-demo"}

Error code
HTTP đề xuất
Frontend xử lý
INVALID_REQUEST / INVALID_IDEMPOTENCY_KEY
400
Sửa input, không retry mù
PRODUCT_NOT_FOUND
404
Hiển thị sản phẩm không tồn tại
IDEMPOTENCY_PAYLOAD_CONFLICT
409
Không dùng lại key cho payload khác; yêu cầu mới phải có key mới
ORDER_ACCESS_DENIED
403 (hoặc 404 để hạn chế enumeration)
Không lộ thông tin đơn, yêu cầu token hợp lệ
RATE_LIMITED
429
Tôn trọng Retry-After nếu có, backoff
ORDER_NOT_QUEUED_YET
503
Giữ key cũ, retry hạn chế hoặc chờ đối soát
INTERNAL_ERROR
500
Không giả định chưa có đơn; nếu retry phải dùng lại key

Polling: đề xuất mỗi 1–2 giây trong cửa sổ lab tối đa 60 giây, có backoff khi 429/5xx; hết hạn poll thì hiển thị Chưa có kết quả, lưu key/orderId để tra cứu tiếp. Không coi timeout là FAILED. Cấu hình và mã lỗi phải chốt cùng Frontend (SCRUM-12), không phải contract đã phát hành.
Bảo mật tạm của bản demo: Không có Cognito, do đó X-Order-Token là bearer capability có entropy cao, không phải xác thực tài khoản/ownership đúng nghĩa. Chỉ lưu key cục bộ, truyền qua HTTPS header (không đưa token vào URL/query string), tránh ghi key vào logs và screenshots. Mẫu có thể bị thay bằng cơ chế mạnh hơn khi phạm vi thay đổi (ADR-003).
7. Domain Model, Idempotency & Business Rules
7.1. Data model v1.1 — 2 DynamoDB tables (đề xuất)
Products — partition key: productId (String).
Thuộc tính
Kiểu
Mô tả
productId
String PK
Định danh SKU
name
String
Tên sản phẩm demo
priceVnd
Number
Giá tham khảo, không có thanh toán
stock
Number >= 0
Số lượng khả dụng để confirm
saleStartAt, saleEndAt
ISO timestamp (optional)
Chỉ thêm nếu cần tính cửa sổ flash sale

Orders — partition key: orderId (String). Không cần GSI cho uniqueness trong MVP.
Thuộc tính
Kiểu
Mô tả
orderId
String PK
Định danh ổn định theo idempotency key, không tạo random mới mỗi retry
idempotencyKeyHash
String
SHA-256 của raw UUID key, để kiểm tra token/order binding
payloadHash
String
SHA-256 của payload canonical (productId, quantity)
productId, quantity
String, Number
Nội dung đơn đã được validate
status
String
PENDING, CONFIRMED, OUT_OF_STOCK, FAILED
enqueueState
String
NOT_SENT, SENDING, SENT, RETRY_REQUIRED, UNKNOWN (nội bộ)
enqueueLeaseUntil
Unix timestamp (optional)
Hạn khóa gửi message của một API/reconciler
enqueueAttemptCount
Number
Số lần thử enqueue được ghi nhận
createdAt, updatedAt
ISO timestamp
Dấu thời gian truy vết
lastErrorCode, failureCode
String (optional)
Mã lỗi nội bộ không chứa PII
correlationId
String
Truy dấu theo đơn

Idempotency key — contract cụ thể đề xuất (ADR-002)
Phạm vi: FLASHRUSH-DEMO — toàn bộ anonymous demo là một namespace; không giả định có userId. Mỗi thao tác mua mới phải sinh một UUIDv4 ngẫu nhiên. Không tái sử dụng key cho lần mua mới.
Khóa duy nhất: server tạo orderId = 'ord_' + first_32_hex(SHA256('flashrush-demo:v1:' + Idempotency-Key)). Với key UUIDv4 và conditional PK, một key luôn ánh xạ đến cùng item; xác suất va chạm hash rút gọn rất thấp nhưng không phải bảo đảm toán học tuyệt đối.
Ghi ban đầu: PutItem(Orders) với ConditionExpression attribute_not_exists(orderId), lưu idempotencyKeyHash và payloadHash, status=PENDING, enqueueState=NOT_SENT.
Payload canonical: normalize productId (theo quy ước case nhất quán) và quantity kiểu số nguyên; tạo serialization ổn định; không đưa requestTime, correlationId vào hash. Cùng key nhưng payload hash khác -> 409.
Hai request đồng thời cùng key: chỉ một conditional Put thành công; request còn lại GetItem (đọc consistent khi cần), kiểm tra hash; trả cùng orderId/status và không tạo đơn mới. Việc enqueue có điều kiện khóa lease ở mục 8.
Replay sau API timeout: giữ key, tính lại cùng orderId, truy vấn bản ghi hiện có; nếu chưa enqueue hoặc kết quả không rõ, thực hiện recovery có điều kiện; không tạo order khác.
Worker message trùng: đọc orderId; nếu terminal thì no-op; nếu hai worker chạy cùng order, điều kiện status=PENDING trong transaction chỉ cho phép tối đa một worker chuyển sang CONFIRMED.
Retention: không dùng TTL tự động trên Orders trong MVP trước cleanup; idempotency được bảo toàn trong toàn bộ thời gian lab/replay. Nếu bổ sung TTL sau này, phải chốt retention tối thiểu lớn hơn cửa sổ retry/replay và chấp nhận rằng key sau khi xóa item không còn được bảo đảm chống tái sử dụng.
Security: raw key không lưu ở database/logs; frontend giữ trong sessionStorage để làm token status, chỉ gửi trong header qua HTTPS. Key bị mất đồng nghĩa không thể tự tra cứu đơn ở chế độ anonymous demo (đã ghi thành hạn chế).
7.2. Business rules & invariants
ID
Quy tắc
BR-01
quantity là số nguyên dương, giới hạn MVP là 1 cho bài test 100/10; rule nhiều quantity chỉ mở rộng khi đã kiểm thử
BR-02
Không commit CONFIRMED khi Products.stock < quantity
BR-03
Chỉ TransactWriteItems đồng thời trừ Products.stock và chuyển Orders PENDING → CONFIRMED
BR-04
OUT_OF_STOCK là kết quả nghiệp vụ, không phải lỗi kỹ thuật để vào DLQ
BR-05
Replay cùng key + payload hoặc message không được tạo thêm sale/double decrement
BR-06
202 Accepted chỉ sau ACK từ SQS và không tuyên bố CONFIRMED
BR-07
Các trạng thái terminal CONFIRMED, OUT_OF_STOCK, FAILED không chuyển ngược PENDING
BR-08
Thất bại transaction phải được phân loại, không tự động coi tất cả là hết hàng
BR-09
UI stock là snapshot tại thời điểm đọc; không giữ chỗ/reserve khi POST nhận 202
BR-10
Không refund/charge vì chưa có thanh toán thật
BR-11
Không nhập thêm hàng trong bài test 100/10 để bảo toàn đối chiếu invariant

7.3. Order state machine & transaction decision table
     Order API: conditional Put
               |
               v
            PENDING  ---- Worker confirms atomically ----> CONFIRMED
               |                 |   +-- verified stock shortage ---------> OUT_OF_STOCK
               |
               +-- confirmed unrecoverable after investigation --> FAILED

       PENDING lâu quá ngưỡng: flag/alert/reconcile, KHÔNG tự FAILED.
       UI Processing = hiển thị của PENDING; chưa cần persisted PROCESSING.

Tình huống
Worker action
SQS outcome
Kiểm chứng
Stock đủ; Orders đang PENDING
Transaction: Update Products SET stock=stock-quantity với stock >= quantity; Update Orders SET status=CONFIRMED với status=PENDING
Thành công, ack
Stock giảm đúng 1 lần, Orders terminal
Stock được xác minh không đủ
Transaction riêng: ConditionCheck Products.stock < quantity + Update Orders PENDING → OUT_OF_STOCK có điều kiện (hai item khác nhau)
Thành công, ack
Không trừ tồn kho
Transaction conflict / concurrent writer
Đọc lại trạng thái bằng consistent read, retry với exponential backoff + jitter và giới hạn
Retry message nếu chưa giải quyết
Không suy luận OOS từ exception chung
DynamoDB throttling / lỗi mạng
Backoff, retry có giới hạn; không thay đổi terminal state
Retry rồi DLQ nếu hết cơ hội
Logs chứa mã lỗi kỹ thuật
Order đã CONFIRMED
No-op, không trừ kho lần hai
Ack
Không đổi stock
Order đã OUT_OF_STOCK / FAILED
No-op, giữ terminal state
Ack
Không ghi đè
Order không tìm thấy / message sai schema
Phân loại lỗi vĩnh viễn; log, DLQ/runbook; không tự tạo sale
DLQ theo policy
Có evidence và alarm
Không chắc transaction đã commit vì timeout
GetItem Orders, kiểm tra terminal + tồn kho; chỉ retry idempotent sau khi đối soát
Retry an toàn
Không double-decrement

Ràng buộc DynamoDB: Trong cùng TransactWriteItems không được thực hiện hai action lên cùng một item; điều kiện kiểm tra status=PENDING phải gắn vào action Update Orders, không thêm ConditionCheck Orders riêng. Với nhánh OUT_OF_STOCK, ConditionCheck Products và Update Orders tác động lên hai item khác nhau, phù hợp giới hạn này.
Phân biệt kết quả API và Worker: hết hàng chỉ là OUT_OF_STOCK khi đã được kiểm tra bằng điều kiện nhất quán; khi chưa biết vì sao transaction fail, giữ đơn non-terminal để retry/điều tra, không chuyển OOS hoặc FAILED tùy tiện.
8. ADR-001 — Order Intake, Enqueue Consistency & Recovery
Trạng thái: Proposed for review (P0). Nguyên nhân: PutItem vào DynamoDB và SQS SendMessage không nằm trong cùng ACID transaction. Phương án MVP dùng conditional intake + enqueue lease + retry/reconciliation thủ công; chưa phải hệ thống outbox tự động có đảm bảo delivery production.
8.1. Quy trình tạo đơn và gửi queue (Option A cho MVP)
Validate: kiểm tra UUIDv4, productId, quantity=1, giới hạn route; canonicalize payload (mục 7.1).
Create: tính deterministic orderId; PutItem Orders điều kiện attribute_not_exists(orderId) với status=PENDING, enqueueState=NOT_SENT. Nếu đã tồn tại, so payload hash, không tạo item thứ hai.
Acquire lease: chỉ thực hiện với Orders còn PENDING; UpdateItem có điều kiện để chuyển enqueueState=NOT_SENT/RETRY_REQUIRED/UNKNOWN (hoặc SENDING có lease hết hạn) sang SENDING, đặt enqueueLeaseUntil và leaseOwner (attempt ID). Hai người xử lý song song chỉ một bên giành được lease hợp lệ.
SendMessage: gửi {schemaVersion,orderId,productId,quantity,correlationId} vào main SQS. SQS Standard có thể nhận message trùng.
ACK từ SQS: nếu SendMessage ACK, cố gắng cập nhật riêng enqueueState=SENT với điều kiện leaseOwner hiện tại; nếu cập nhật này lỗi thì ghi log để đối soát vì thông điệp đã được nhận, không phát lại ngay; nếu Worker đã confirm nhanh, chỉ cập nhật field enqueue, không ghi đè status cuối. Trả 202 kèm orderId, status=PENDING hoặc trạng thái terminal thực tế mới đọc; không tuyên bố CONFIRMED chỉ từ ACK.
Lỗi chắc chắn / không chắc chắn: network timeout hoặc 5xx được ghi UNKNOWN (do không biết SQS nhận hay chưa); lỗi gửi xác định thì RETRY_REQUIRED. API trả 503 ORDER_NOT_QUEUED_YET hoặc kết quả lỗi có thể retry, dặn giữ cùng key. Không trả 202 khi chưa có xác nhận enqueue.
Replay: duplicate POST cùng key/payload đọc cùng order. Nếu terminal → 200 status; nếu SENT và PENDING → 202 (không cần gửi lại); nếu chưa gửi/không chắc và lease đã hết → cơ chế retry enqueue có guard, có thể gửi message duplicate nhưng Worker idempotent.
Vùng lỗi cần chấp nhận: SendMessage thành công rồi API crash trước khi đánh dấu SENT; script hoặc request replay có thể gửi lại message. Đây là chủ ý thiết kế at-least-once, không phải exactly-once end-to-end. TTL/timeout lease chỉ là đề xuất và phải kiểm tra workload.
8.2. Enqueue-state contract
enqueueState
Ý nghĩa
Có thể retry?
Yêu cầu xử lý
NOT_SENT
Order mới được ghi, chưa bắt đầu enqueue
Có
Giành lease rồi gửi
SENDING
Đang giữ lease gửi queue
Sau lease expiry
Không cho request khác gửi khi lease còn hạn
SENT
SQS trả ACK thành công
Không cần gửi lại thông thường
Chờ Worker; nếu quá hạn cần điều tra queue/DLQ
RETRY_REQUIRED
Gửi thất bại đã biết
Có, với backoff và giới hạn
Reconciler/operator hoặc POST replay
UNKNOWN
Timeout/crash, không biết queue đã nhận chưa
Có, sau kiểm tra lease
Resend idempotent; giữ audit trail

Các trường enqueueState, status là hai chiều độc lập: SENT không đồng nghĩa CONFIRMED; PENDING không đồng nghĩa enqueue chưa hoàn tất.
8.3. Các mốc thời gian đề xuất cho lab (chưa approved)
Tham số
Giá trị khởi điểm để thử
Ý nghĩa
Enqueue lease
30 giây
Sau khi quá hạn, request/reconciler khác mới có thể gửi lại
Intake chưa xác nhận enqueue
> 2 phút
Gắn cờ PENDING đáng kiểm tra
Đơn SENT nhưng chưa terminal
> 5 phút
Kiểm tra queue depth/DLQ/logs, chưa tự động resend
Reconciliation cadence
Sau mỗi batch test và trước khi demo; khi có alarm hoặc lỗi 503
Thủ công có người chịu trách nhiệm
Max enqueue retry (API + operator)
3 lần trước khi escalate
Ngăn vòng lặp không kiểm soát; mỗi lần retry ghi log

Không sử dụng mốc này làm SLA sản phẩm. Với workshop demo tốc độ khác dự kiến, QA cập nhật các ngưỡng dựa trên số liệu thật.
8.4. Xử lý tình huống lỗi điển hình
Tình huống
Phát hiện
Hành động đúng
Put PENDING fail
DynamoDB error/conditional
Không gửi SQS cho request không tồn tại; lỗi có thể retry dùng key cũ
Put thành công, SQS fail chắc chắn
RETRY_REQUIRED, API 503
Retry có lease, cùng orderId
SQS ACK nhưng response đến API timeout
UNKNOWN hoặc SENDING hết lease
Đối soát rồi resend an toàn; Worker no-op khi terminal
API timeout sau SQS ACK, frontend không nhận 202
Client còn Idempotency-Key
Retry POST cùng key; đọc cùng orderId và trạng thái
Worker confirm trước khi API update SENT
Orders đã terminal
Không hạ status xuống PENDING; cập nhật enqueue-state nếu lease hợp lệ
Main queue có duplicate
SQS at-least-once
Worker kiểm tra terminal + transaction conditional
Message vào DLQ
SQS DLQ metric/logs
Điều tra và đối soát Orders; không tự gán FAILED
Orders PENDING kéo dài
Reconciliation scan/check logs
Quyết định retry/điều tra/manual resolution, có audit

8.5. Reconciliation & DLQ runbook (MVP, không thêm AWS service)
Người chịu trách nhiệm: chủ sở hữu SCRUM-11 (Queue/Worker) cùng SCRUM-10 (DynamoDB); SCRUM-13 kiểm tra evidence và SCRUM-6 phê duyệt phương án. Thành phần: scripts/reconcile_pending.py chạy thủ công bằng tài khoản operator có IAM hạn chế, dùng DynamoDB Scan phù hợp quy mô 100 đơn của lab; không dùng Scan làm chiến lược production.
Ghi lại mốc test, Region, queue URL, môi trường và correlation ID; dừng/gate load test nếu cần.
Scan Orders với status=PENDING và createdAt/updatedAt quá ngưỡng đề xuất; đối chiếu enqueueState, enqueueAttemptCount, leaseUntil và Logs/SQS backlog/DLQ.
Với NOT_SENT, RETRY_REQUIRED, UNKNOWN, SENDING lease đã hết: giành conditional lease rồi gửi message cùng orderId. Nếu SQS phản hồi không chắc chắn, không tự ghi SENT.
Với SENT nhưng chờ quá lâu: kiểm tra logs/queue/DLQ và tình trạng Lambda trước; không resend hàng loạt mù. Nếu xác minh cần redrive, chỉ làm có kiểm soát, chống duplicate.
Nếu gặp message DLQ: đọc order state; terminal → không redrive; PENDING → khắc phục nguyên nhân, redrive có giới hạn và theo dõi. DLQ không đồng bộ trạng thái Orders tự động.
Chỉ chuyển FAILED sau khi xác minh không có commit thành công hoặc xử lý đang chạy, xác định lỗi vĩnh viễn và ghi bằng chứng/decision log. Khi còn mơ hồ, giữ PENDING với nhãn cần điều tra.
Báo cáo stuck_pending_count, tuổi đơn, số lần retry, DLQ depth, resolved/unresolved; không kết luận “0 đơn treo” nếu chưa đối soát.
Giới hạn vận hành: script thủ công không cung cấp cam kết phát hiện liên tục. Để đủ nghiệm thu MVP, nhóm phải chạy script trong thử nghiệm recovery và ghi output; nếu muốn tự động 24/7 phải cập nhật architecture/chi phí và duyệt thay đổi phạm vi.
9. SQS & Lambda Worker Contract — SCRUM-11
9.1. Message & source mapping
Main: SQS Standard Queue; DLQ: SQS Standard DLQ cùng Region, dùng redrive policy. Lambda poll qua event source mapping (SQS không trực tiếp HTTP invoke Worker). ReportBatchItemFailures là cấu hình mapping; một message OUT_OF_STOCK thành công không phải lỗi batch.
{"schemaVersion":"1.0","orderId":"ord_e87ffcabafcd1bb864f91f897647a177","productId":"SKU-001","quantity":1,"correlationId":"corr-uuid"}
Không gửi raw idempotency key/X-Order-Token, email, địa chỉ hoặc thông tin thanh toán vào SQS.
9.2. Cấu hình khởi điểm cho lab — cần đo và phê duyệt
Tham số
Giá trị đề xuất khởi điểm
Giải thích / xác minh
Queue type
SQS Standard
Chấp nhận at-least-once, không đảm bảo thứ tự
Worker Lambda timeout
15 giây
Thử 100 request; đủ cho một transaction & logging
SQS visibility timeout
90 giây
Mốc khởi điểm = 6 × Lambda timeout; xem lại nếu thêm batching window
Batch size
1
Dễ quan sát và phân loại lỗi ở demo đầu tiên
Maximum batching window
0 giây
Đơn giản hóa latency lab
Event source maximum concurrency
5
Hạn chế mức xử lý đồng thời ban đầu; bảo đảm reserved concurrency nếu dùng không nhỏ hơn 5
maxReceiveCount
5
Sau nhiều lần nhận lỗi, SQS redrive vào DLQ
Main message retention
4 ngày
Giá trị khởi điểm; không thay thế order audit
DLQ message retention
14 ngày
Tạo thời gian điều tra dài hơn main queue
Partial batch failure
ReportBatchItemFailures
Duy trì khả năng mở rộng batch size mà không retry message tốt trong batch lỗi
Backoff
Exponential + jitter, có giới hạn
Phân biệt transient throttling/conflict với business OOS

Không coi bảng trên là cấu hình đã chạy. Bắt buộc kiểm tra quota, mức AWS cho phép và thực tế test trước khi ghi vào tài liệu triển khai. Max concurrency của mapping SQS phải hợp lệ với cấu hình reserved concurrency, nếu có. Với batch size 1, partial-batch response ít khác biệt nhưng vẫn là mẫu an toàn để nâng batch sau này.
9.3. Worker processing outcome
Validate message schema/version và orderId; load Orders (consistent read khi cần).
Nếu terminal → ghi duplicate ignored và thành công/ack; không ghi stock.
Nếu PENDING: thực hiện transaction Products conditional decrement + Orders conditional PENDING→CONFIRMED.
Nếu transaction thất bại, phân loại theo mục 7.3; khi stock được xác minh thiếu, transaction riêng đưa Orders sang OUT_OF_STOCK.
Với transient failure: return failed messageId trong batchItemFailures, để Lambda/SQS retry sau visibility timeout; không tự gửi lại message lên main queue.
Với poison message/permanent technical error: ghi lỗi và theo policy retry đến DLQ để người vận hành điều tra; không tự biến thành OUT_OF_STOCK hoặc FAILED.
Không bao giờ giảm stock nếu Orders đã terminal. Bằng chứng đúng đắn là trạng thái cuối trong Orders và stock trong Products, không phải số lần invoke Worker.
Retry: một message thất bại trở lại trạng thái visible sau visibility timeout khi không được xóa; maxReceiveCount quyết định redrive tới DLQ. Đường trên diagram nếu có phải ghi message visible again / Lambda poller retry, không vẽ Worker SendMessage trả về queue như luồng thường.
10. Non-functional Requirements & Security Decision
ID
Thuộc tính
Mục tiêu và cách nghiệm thu
Tình trạng
NFR-01
Consistency
Không oversell; initialStock - sum(confirmedQty) = finalStock >= 0
Chưa chạy test
NFR-02
Idempotency
Replay key 10 lần / SQS duplicate không tăng số đơn và không double-decrement
Chưa chạy test
NFR-03
Load
100 unique request cạnh tranh stock 10, nêu rõ accepted/rejected/pending
Chưa benchmark
NFR-04
Recovery
Có script đối soát và runbook DLQ; không có PENDING quá hạn không được phát hiện trong buổi test
Chưa chạy test
NFR-05
Response semantics
202 chỉ sau SQS ACK, kết quả qua Status API
Contract đề xuất
NFR-06
Security
Least privilege, HTTPS/OAC, throttling, order token, không public admin mutation
Cần review SCRUM-8/9
NFR-07
Observability
Metrics có nguồn rõ, logs trace bằng orderId/correlationId, SNS alarm
Chưa triển khai
NFR-08
Latency
Đo p50/p95 HTTP API và latency order terminal; không tự đặt SLA chưa đo
Chưa đo
NFR-09
Cost
Lab mục tiêu < 5 USD, kiểm chứng Pricing Calculator và billing thực tế
Chưa xác nhận
NFR-10
Reproducibility
README/test/cleanup, Hugo song ngữ, ảnh thật có timestamp/Region
Chưa nghiệm thu

10.1. Bảo mật ứng dụng và tài nguyên — ADR-003
Phạm vi
Quyết định đề xuất cho MVP
Public catalog
Public GET; áp API Gateway stage/route throttling để hạn mức tải demo
POST /orders
Public nhưng yêu cầu UUIDv4 Idempotency-Key, validate payload/quantity và giới hạn request; rate limit không biến API thành chống bot tuyệt đối
GET /orders/{orderId}
Yêu cầu header X-Order-Token bằng key bí mật của đơn, kiểm tra SHA256(key) với idempotencyKeyHash trong Orders; không công bố key trong URL, logs hoặc ảnh
API error
Tránh lộ order tồn tại khi thiếu token (trả 403 hoặc 404 nhất quán), không trả dữ liệu cá nhân
Admin UI
Prototype mô phỏng, không xây public endpoint sửa stock, redrive DLQ hoặc xem secret; nếu làm thật cần ADR/auth riêng
React frontend
S3 private + CloudFront OAC; JS bundle chỉ có public API URL, không có AWS credentials
API Lambda IAM
Get Products/Orders, conditional Put/Update Orders & SQS SendMessage trong resource cụ thể
Worker Lambda IAM
SQS poll/receive/delete + DynamoDB read/transaction writes Products/Orders, CloudWatch Logs
Operator recovery
Role/credentials riêng, quyền Scan/Update Orders và SendMessage, thao tác có kiểm soát; không tái sử dụng root
Logging
Log requestId/orderId, loại trừ raw header keys, bearer tokens, access keys và dữ liệu nhạy cảm

Hạn chế được công bố: Xác thực bằng capability token là biện pháp demo khi chưa có Cognito/user identity, không chứng minh đúng quyền sở hữu đơn hàng như production. CORS chỉ hỗ trợ chính sách trình duyệt, không thay thế authentication. Nếu workshop công khai ngoài nhóm, phải review lại threat model/abuse risk và quyết định có bổ sung cơ chế xác thực hay không.
10.2. Giới hạn triển khai
Sử dụng một AWS account được cấp quyền hợp lệ là đề xuất, không gửi root/password qua chat hoặc repo.
us-east-1 là Region dự kiến, cần kiểm tra dịch vụ, quota, credits và bài test trong môi trường được phép.
Throttling giới hạn lượng request API nhưng không phải cơ chế chặn chi phí tuyệt đối. Không dùng CORS để ngăn request từ script.
11. Monitoring, Testing & Evidence
11.1. Metrics contract (nguồn dữ liệu & cách diễn giải)
Chỉ số
Nguồn dữ liệu đề xuất
Quy tắc tính/giới hạn
confirmed_unique_orders
Orders DynamoDB (truy vấn/scan audit), có thể thêm custom metrics CloudWatch
Đếm đơn duy nhất status=CONFIRMED, không đếm số message/invoke
out_of_stock_unique_orders
Orders DynamoDB
Đếm đơn terminal OUT_OF_STOCK duy nhất
failed_unique_orders
Orders DynamoDB
Đếm FAILED đã được điều tra/đánh dấu, không bằng DLQ depth
stuck_pending_count
reconcile_pending.py từ Orders; xuất report/log
Đơn PENDING vượt ngưỡng, cần review hàng ngày/trong buổi lab
accepted_requests
HTTP API access/application logs
Chỉ đếm unique newly accepted POST hoặc report cả raw 202 và unique order, phải ghi định nghĩa
API p50/p95/error/429
API Gateway + application logs/metrics
Tách request được throttle và lỗi server
Lambda Invocations, Errors, Duration, Throttles
CloudWatch Lambda metrics
Không bằng số đơn thành công
SQS Visible/NotVisible/Age
CloudWatch SQS metrics
Queue depth/age chỉ là mức độ tải, không dùng tính sales
DLQ depth
SQS approximate number of visible messages
Báo hiệu message cần điều tra, không tự động tương đương FAILED
DynamoDB throttle/cancel/retries
CloudWatch DynamoDB metrics + structured logs
Phân loại conflict vs stock shortage, không gộp mọi lỗi transaction thành OOS
Alarm / notification
CloudWatch Alarms → SNS
Có evidence alarm ở ngưỡng test, email subscription đã xác nhận

Giới hạn metric: CloudWatch/SQS counters có thể xấp xỉ hoặc lặp do retry. Source of Truth về kết quả mua hàng là Orders + Products sau khi toàn bộ yêu cầu hoàn tất. Dashboard mô phỏng phải gắn nhãn “Dữ liệu mô phỏng” rõ ràng.
11.2. Test matrix — giữ 11 TC gốc và bổ sung input/evidence/pass criteria
TC
Input / tình huống
Expected Result
Evidence yêu cầu
PASS criteria
TC-01
1 sản phẩm stock=2; POST 1 key, qty=1
1 CONFIRMED; stock từ 2→1
HTTP 202 + poll, Orders/Products trước sau
Đúng 1 CONFIRMED, stock giảm 1
TC-02
100 POST độc lập, 100 UUIDv4, qty=1, stock=10; có giới hạn tốc độ thử
Ở kịch bản hoàn tất/lành mạnh: 10 CONFIRMED, 90 OOS, stock=0
Script, timestamp, Region, accepted/rejected, Orders, Products, latency
Bất biến: ΣconfirmedQty ≤ 10, finalStock=10−ΣconfirmedQty≥0; mục tiêu 10/90 chỉ pass nếu đủ 100 accepted/terminal và không lỗi kỹ thuật
TC-03
10 POST cùng key + cùng payload
Same orderId; không thêm sale
HTTP responses, Orders count, stock audit
1 order, stock giảm ≤1
TC-04
2 POST cùng key, productId hoặc quantity khác
409 conflict cho request sau
Response/error code + logs
Không overwrite order gốc
TC-05
Replay cùng SQS message 2–5 lần
Worker no-op sau terminal
Worker logs, Orders/Products audit
Stock không double decrement
TC-06
Inject DynamoDB throttle/conflict tạm thời trong lab
Retry/backoff rồi success hoặc DLQ, không OOS sai
Structured logs, retry attempt
Không set OOS chỉ từ technical exception
TC-07
Inject poison message, vượt maxReceiveCount
Chuyển DLQ, có alarm/log
DLQ metrics, redrive policy, SNS email
Có message DLQ & evidence, Orders không auto FAILED
TC-08
Put PENDING OK; chặn SQS SendMessage hoặc timeout
API 503; state RETRY_REQUIRED/UNKNOWN; retry cùng key có thể phục hồi
API errors, Orders enqueue fields, reconciliation output
Không tạo order thứ hai, không PENDING mồ côi không được phát hiện
TC-09
Quantity 0/âm/string, sai JSON, thiếu key, product không tồn tại
400/404 đúng contract
Responses + kiểm tra Orders count
Không tạo order / không enqueue
TC-10
Lambda Worker tạm ngưng sau khi nhận 202
UI hiển thị PENDING/Processing, không “đặt thành công”
Screen recording + GET Orders
202 không biến thành CONFIRMED ở UI
TC-11
Cleanup của môi trường lab
Tài nguyên mục tiêu được dọn, còn bill chờ cập nhật nếu có
CLI/console evidence + resource inventory
Không còn thành phần lab phát sinh phí không chủ ý; không tuyên bố bill ngay bằng 0
TC-12
SQS ACK thành công nhưng Order API timeout trước khi trả 202
Retry POST cùng key trả cùng orderId; có thể duplicate message
Mock/fault injection logs, Orders audit
Không có đơn trùng hoặc double decrement
TC-13
Pending tuổi > threshold; run reconcile manual
Nhận diện, giành lease, enqueue có điều kiện hoặc flag investigate
Log script, ảnh Orders trạng thái trước/sau
Không bỏ sót/ghi sai terminal, có log unresolved
TC-14
GET orderId hợp lệ nhưng thiếu/sai X-Order-Token
403/404 và không lộ order
HTTP responses, logs không chứa key
Không đọc được trạng thái bằng orderId đơn lẻ

Phạm vi kết luận TC-02: nếu trong 100 request có 429/503/timeouts, phải báo cáo ba tập: submitted, accepted unique, terminal. Không lấy 100 submitted làm 100 accepted; không áp dụng công thức 10/90 khi chưa đủ 100 accepted và xử lý xong. Ghi riêng số PENDING quá hạn, số DLQ, latency và số lần retry.
11.3. Evidence checklist
Thời gian/Region/Account alias không nhạy cảm; seed product với stock=10.
Script và tham số tạo tải, idempotency uniqueness, accepted/rejected counts.
Ảnh/JSON Orders & Products ở trạng thái cuối, kiểm tra invariant, không dùng dữ liệu mẫu giả làm kết quả.
CloudWatch log/correlationId, SQS queue/DLQ metrics, cảnh báo SNS thật.
Test duplicate, SQS ACK timeout, recover pending, DLQ redrive điều tra.
API p50/p95, worker completion latency, logs lỗi kỹ thuật và dữ liệu trước/sau cleanup.
Chưa có minh chứng thực nghiệm trong tài liệu phiên bản 1.1.
12. Delivery Plan & FCAJ Workshop Structure
12.1. Sprint map (4 Sprint đã có trong Jira)
Sprint
Kết quả mong đợi
Gate
Sprint 1 — Planning & Architecture
Scope, architecture, API schema, SQS contract, test plan, UI prototype, GitHub
Bản thiết kế được nhóm review
Sprint 2 — Core Backend
DynamoDB, SQS/DLQ, Lambda API/Worker và smoke test
Một request đặt hàng end-to-end thành công
Sprint 3 — Web & Integration
Web React, CloudFront/S3, polling, CloudWatch/SNS
Luồng từ browser đến kết quả thực hoạt động
Sprint 4 — Validation & FCAJ
Load testing, retry/idempotency test, docs song ngữ, chi phí, cleanup
Có minh chứng thực, có thể thực hành lại

12.2. Workshop content tree
content/5-Workshop/
├── 5.1-Workshop-overview/
├── 5.2-Prerequisite/
├── 5.3-Infrastructure/
│   ├── 5.3.1-create-dynamodb/
│   ├── 5.3.2-create-sqs-dlq/
│   └── 5.3.3-iam-roles/
├── 5.4-Application-deployment/
│   ├── 5.4.1-order-worker/
│   ├── 5.4.2-api-lambda/
│   ├── 5.4.3-api-gateway/
│   └── 5.4.4-web-demo/
├── 5.5-Testing-and-monitoring/
│   ├── 5.5.1-concurrency-test/
│   ├── 5.5.2-retry-idempotency/
│   ├── 5.5.3-cloudwatch-alerts/
│   └── 5.5.4-demo-results/
└── 5.6-Cleanup/
Mỗi trang Hugo có _index.vi.md (tiếng Việt), _index.md (tiếng Anh), ảnh từ lần thực hành thật, lệnh/tham số và kết quả mong đợi. Cần review quy ước weight, links và shortcode đúng template FCAJ đang dùng.
12.3. Definition of Done — SCRUM-6
Có file kiến trúc .drawio/PNG (Architecture v1.1) để nhóm review; chưa xác nhận đã merge phiên bản mới nhất vào repo.
Có bản system-overview.md v1.1 Revised Draft sau checklist sửa P0.
Review sơ đồ với người phụ trách API, DynamoDB và SQS.
Review và ký duyệt ADR-001 (intake/enqueue recovery), ADR-002 (idempotency), ADR-003 (bảo vệ API); đề xuất trong tài liệu chưa phải Approved.
Thống nhất Region, AWS account strategy, security baseline và giới hạn chi phí.
Đồng bộ Draw.io theo v1.1 (PENDING conditional Put từ API; Worker conditional Update; status GET; retry semantics) và lưu quyết định chính thức.
Đính kèm tài liệu/kiến trúc vào Jira, ghi biên bản review và bản đã được nhóm phê duyệt.
Đề xuất Jira status: In Progress cho đến khi các mục chưa hoàn thành được review và xác nhận.
13. AWS Cost Estimation & Cleanup Governance — SCRUM-8
13.1. Workload assumptions (chưa phải báo giá)
Giả định
Giá trị lab để nhập Calculator
Region
us-east-1 dự kiến (phải kiểm tra account/credits)
Thời gian tài nguyên hoạt động
Dự kiến 1–3 ngày cho các đợt demo; cập nhật theo lịch thật
Tải thử
100 POST tranh mua 10 stock, vài vòng smoke/replay và ~1.000–5.000 GET/poll trong giai đoạn test
Frontend
Dưới ~100 MB dữ liệu tĩnh; traffic CDN ước tính cần đo trước
Lambda
2 functions, ngắn hạn; requests/GB-seconds tính theo test & polling
SQS
1 main + 1 DLQ, chi phí Send/Receive/Delete và poll requests (kể cả idle polling nếu có)
DynamoDB
2 tables on-demand, số reads/writes/transaction units + storage tính từ test
CloudWatch/SNS
Logs, metrics, số alarms, thông báo email và retention

13.2. Bảng chi phí cần điền từ AWS Pricing Calculator
Dịch vụ / tài nguyên
Khối lượng cần đo hoặc nhập
Dự toán (USD)
Evidence / trạng thái
Amazon S3
GB-month, PUT/GET
TBD
Calculator screenshot
Amazon CloudFront
Data transfer/requests
TBD
Calculator screenshot
Amazon API Gateway HTTP API
Số API requests
TBD
Calculator screenshot
AWS Lambda
Invocations, GB-s
TBD
Calculator screenshot
Amazon SQS main + DLQ
API request volume & retention
TBD
Calculator screenshot
Amazon DynamoDB Products/Orders
Read/write units, transactions, GB-month
TBD
Calculator screenshot
Amazon CloudWatch
Logs ingest/storage, alarms, custom metrics
TBD
Calculator screenshot
Amazon SNS
Email publish/delivery
TBD
Calculator screenshot
AWS IAM
Vai trò, policy thông thường
Không dự toán chi phí runtime riêng
Xác minh tính năng cụ thể khi dùng
Tổng trước credits/tax
Bao gồm các thành phần tính phí
TBD
Ghi thời gian tra giá và Region

Mục tiêu quản trị: cố gắng dưới 5 USD cho lab; đây không phải kết quả Calculator, không có bảo đảm chi phí, đặc biệt khi CloudFront distribution/logs/alarms/queue polling còn hoạt động. Free Tier, credits, thuế và thời gian billing cập nhật phụ thuộc tài khoản và ngày sử dụng. AWS Budgets cảnh báo chứ không phải hard spending cap.
13.3. Quy trình trước khi tạo tài nguyên
Xác minh loại tài khoản, AWS credits/ngày hết hạn, permissions, Region/quota.
Chốt tên resource prefix flashrush-lab-, tags Project=FLASHRUSH, Environment=lab, Owner=<team>.
Tạo AWS Budget / billing alert phù hợp quyền và kiểm tra email nhận thông báo; ghi rõ không ngăn vượt ngưỡng tức thời.
Định rõ max thời gian chạy load test, queue concurrency, số vòng test; chỉ test tài nguyên do nhóm sở hữu và được phép.
Export resource inventory ngay khi tạo: ARN/Region/owner/date/cleanup method; không đưa ARN chứa thông tin nhạy cảm vào tài liệu công khai nếu chưa review.
13.4. Cleanup verification
Dừng stress test, disable event source mapping, xử lý/delete SQS và DLQ, Lambda, API Gateway, DynamoDB tables/dữ liệu theo kế hoạch.
Delete CloudWatch alarms/log groups, SNS topics/subscriptions; disable/delete CloudFront distribution, S3 objects/bucket và các resource demo liên quan.
Kiểm tra không còn quyền IAM/secret demo không cần thiết; review resource inventory từng ARN.
Kiểm tra Billing/Cost Explorer sau khoảng thời gian cập nhật; không tuyên bố “chi phí đã bằng 0” nếu AWS chưa phản ánh số liệu thực tế.
14. Risk Register, Assumptions & Dependencies
ID
Rủi ro / giả định
Ảnh hưởng
Biện pháp / chủ sở hữu
R-01
DynamoDB Orders PENDING và SendMessage không atomic
PENDING treo / enqueue trùng
Enqueue-state, conditional lease, manual reconciliation — SCRUM-9/10/11
R-02
SQS Standard at-least-once
Duplicate processing, double-decrement
Conditional transaction + TC-03/05/12
R-03
Nhầm transaction error là OOS
Sai kết quả nghiệp vụ
Phân loại failure + reread + OOS conditional transaction
R-04
DLQ không cập nhật Orders tự động
Order không terminal
Runbook DLQ & stuck report, không auto FAILED
R-05
Idempotency key không unique nếu chỉ là field thường
Duplicate order
Deterministic PK + conditional Put, UUIDv4, payloadHash
R-06
Chưa có authentication người dùng
Có nguy cơ truy vấn trạng thái/abuse
Bearer order token trong demo, throttling, không PII/admin mutation
R-07
9 dịch vụ vẫn có thể phát sinh phí
Vượt ngân sách lab
Calculator + AWS Budget + hạn thời gian demo + cleanup
R-08
UI dùng mock metric như số liệu thật
Thiếu trung thực chứng cứ
Hiển thị “Dữ liệu mô phỏng”, chỉ dùng evidence thật khi kết luận
R-09
Hợp đồng API, DynamoDB và queue chưa cùng phiên bản
Lỗi tích hợp Sprint 2
SCRUM-9/10/11 cùng review ADR và schema trong PR
R-10
Nhóm hiện 4 người, kế hoạch 5
Thiếu nhân lực phần documentation/QA
Review phân công và timebox ưu tiên MVP
R-11
Reconciliation thủ công bị quên
Không phát hiện pending trong lab
Checklist sau từng load run, báo cáo owner + metric/stuck count
R-12
Ước tính 10/90 bị công bố dù chỉ một phần request accepted
Sai báo cáo kết quả
TC-02 ghi accepted/rejected/terminal, đối chiếu dữ liệu thực
R-13
Khác format key/orderId và token giữa API/UI
Retry không an toàn, polling fail
OpenAPI review và test contract trước code

Giả định thiết kế: lab chỉ có một Region, một sản phẩm tranh mua trong test chính, không restock trong test và không có giao dịch thanh toán. Các giả định phải được xác nhận bởi reviewer, không suy rộng thành yêu cầu production.
15. Architecture Decision Records (ADR) & Approval Log
ADR
Nội dung
Phương án đề xuất / tình trạng
Chủ trì
Gate
ADR-001
PENDING + SQS consistency, enqueue recovery
Conditional Put + enqueue lease + manual reconciliation; Proposed
API, DB, Queue Owners
Trước Sprint 2
ADR-002
Uniqueness + idempotency key retention
Namespace anonymous demo, UUIDv4 → deterministic orderId SHA-256 + conditional Put; Proposed
API + DB Owners
Trước Sprint 2
ADR-003
Throttling, order GET authorization, Admin
X-Order-Token bearer capability + route throttling, mock admin; Proposed
Lead + API + Frontend
Trước public deployment
ADR-004
AWS account, Region, IAM policies
One account, us-east-1 và least privilege; Open / SCRUM-8
Cloud Architect
Trước AWS deployment
ADR-005
UI thực / mock
8 màn thiết kế, core flow thật, admin/monitoring mock ghi nhãn; Proposed
Frontend + QA
Trước Sprint 3
ADR-006
Giới hạn chi phí/lưu lượng
Mục tiêu lab < 5 USD, cần Calculator/evidence; Open / SCRUM-8
Lead + QA
Trước AWS deployment
ADR-007
SQS/Worker config, DLQ runbook
Bộ cấu hình khởi điểm ở mục 9; phải test; Proposed
Queue + QA
Trước Sprint 2 integration

15.1. Những câu hỏi phải chốt trong review
Có dùng orderId deterministic từ UUIDv4 Idempotency-Key và Orders chỉ với PK orderId không?
Team có chấp nhận enqueue-state/lease và manual reconciliation trong phạm vi workshop, hay muốn transactional outbox tự động (tăng phạm vi)?
Chỉ trả 202 khi SQS.SendMessage ACK và khi uncertain trả 503, frontend retry cùng key — đồng ý không?
Có dùng bearer capability X-Order-Token thay cho hệ thống tài khoản đầy đủ trong demo không?
Ai chịu trách nhiệm chạy reconcile_pending.py sau mỗi test và xử lý các đơn trên DLQ?
Chốt cấu hình bảng mục 9.2, điều kiện pass TC-02 và lịch đo chi phí/cleanup ra sao?
15.2. Approval record — chưa có chữ ký / xác nhận nhóm
Vai trò
Người review
Trạng thái
Project Lead / Cloud Architect
Chưa ghi nhận
Pending
Backend/API Owner
Chưa ghi nhận
Pending
Database/Queue Owner
Chưa ghi nhận
Pending
Frontend Owner
Chưa ghi nhận
Pending
QA / Monitoring Owner
Chưa ghi nhận
Pending

Không thay Pending thành Approved nếu chưa có bình luận Jira, PR approval hoặc biên bản review thực. Chỉ khi các ADR blocking được chấp thuận mới phát hành Approved Baseline.
16. References, Traceability & Source of Truth
Tài liệu nội bộ
Jira Board: https://ktran6738.atlassian.net/jira/software/projects/SCRUM/boards/1
SCRUM-6 (architecture, scope): https://ktran6738.atlassian.net/browse/SCRUM-6
SCRUM-8 (IAM, account, cost): https://ktran6738.atlassian.net/browse/SCRUM-8
SCRUM-9 (API contract), SCRUM-10 (DynamoDB), SCRUM-11 (Queue/Worker), SCRUM-12 (Frontend), SCRUM-13 (QA).
Sơ đồ hiện được dùng để đối chiếu: Flash_Sale_Architecture_Updated.drawio (Architecture v1.1, cần đồng bộ và xác nhận lần cuối). Khi review xong, xuất PNG từ chính file Draw.io hiện hành.
Source review: Pasted markdown.md — checklist 5 P0, 6–11 mục ưu tiên API/security/monitoring/QA và hướng sửa Draw.io.
FCAJ Hugo workshop: 5-Workshop/, mỗi phần _index.md (English) + _index.vi.md (Vietnamese), dùng screenshots/lệnh thật.
AWS official references để đối chiếu khi hiện thực
DynamoDB transactions và giới hạn same-item operations: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html
Lambda + SQS error handling, partial batch: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-errorhandling.html
SQS Lambda configuration, visibility timeout: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html
Lambda SQS maximum concurrency: https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-scaling.html
AWS Pricing Calculator: https://calculator.aws/
Traceability
Work item
Tài liệu/cấu phần
Gate bàn giao
SCRUM-6
Mục 2, 4, 5, 8, 15; Draw.io
Review & chốt architecture/ADR blocking
SCRUM-9
Mục 6, 7, 8, 10
OpenAPI, idempotency/API error semantics
SCRUM-10
Mục 7, 8
Keys, conditional Put/Update, transaction pseudocode
SCRUM-11
Mục 8, 9
Queue configs, worker retries, DLQ & reconcile runbook
SCRUM-12
Mục 4, 6, 10
UI flow đúng trạng thái và token/polling
SCRUM-13
Mục 11
Test matrix/evidence có thể chạy, không bịa dữ liệu
SCRUM-8
Mục 10, 13
IAM least privilege, AWS Budget, Calculator & cleanup


17. Revision Summary — v1.0 → v1.1 (Draft)
Hạng mục checklist
Thay đổi đã thực hiện trong tài liệu
Còn phải xác nhận / triển khai
P0-1
Order API conditional Put PENDING, Worker Update CONFIRMED trong transaction
SCRUM-9/10/11 duyệt & sync Draw.io
P0-2
Global demo UUIDv4 → deterministic orderId, uniqueness bằng conditional Put, payloadHash, replay concurrency/retention
Viết unit/integration tests thật
P0-3
Enqueue-state, lease, HTTP 202 semantics, 503 unknown, recovery thủ công
Implement reconcile_pending.py, test ACK timeout
P0-4
Worker decision table + invariant + phân loại errors + transaction OOS riêng
Validate DynamoDB transaction & cancellation reasons thực tế
P0-5
Phát hiện PENDING quá hạn, DLQ runbook, chủ sở hữu và manual reconciliation
Logs/alerts/script & evidence thật
P1 API/security
Endpoint contract, error schemas, order token, throttling/admin giới hạn
Review SCRUM-9/8/12
P1 SQS
Cấu hình đề xuất có lý do và nguồn AWS
Benchmark và chốt trên AWS
P1 QA/observability
Metrics-source table, 11 TC gốc + 3 TC bổ sung, input/evidence/pass
Test thật, không tự kết luận 10/90
P1 cost/UI
Bảng calculator TBD, scope Google Stitch khớp MVP
Screenshot Calculator và review UI

Giới hạn tài liệu: Đây là bản thiết kế nhất quán hơn để nhóm review, không phải bằng chứng hệ thống đã triển khai, không được gọi là Approved Baseline khi chưa có xác nhận trong Jira.
