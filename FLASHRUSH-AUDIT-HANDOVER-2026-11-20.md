# FLASHRUSH — Báo cáo audit và bàn giao xử lý

Ngày đánh giá: **20/11/2026**. Baseline: `main`, commit `6ad6212b9a6865fa47fd342aae9d1bc563ede842`.

Repository: https://github.com/kinnynee/FLASHRUSH-Serverless-Flash-Sale

> Cập nhật sau audit: đã có sửa đổi source ngày 20/11 theo yêu cầu chủ dự án. Xem [trạng thái khắc phục](FLASHRUSH-Serverless-Flash-Sale/docs/operations/remediation-status.md). Nội dung audit bên dưới giữ nguyên để đối chiếu baseline; không phải kết luận nghiệm thu sau sửa.

## 01. Kết luận và phạm vi bàn giao

**CONDITIONAL GO** cho lập kế hoạch khắc phục và hoàn thiện Overview. **Chưa đủ điều kiện** phát hành FCAJ Workshop đầy đủ, có thể tái lập từ đầu đến cleanup.

Đây là báo cáo Stage 0 theo `PROMPT-MAU-FLASHRUSH.md`, được tổng hợp từ kết quả audit đã trình bày trong chat. Báo cáo không phải phê duyệt triển khai. Chưa sửa các phát hiện, chưa triển khai lại, chưa cập nhật Jira, chưa commit/push báo cáo này.

Các đội có thể dùng tài liệu để phân công và lập phương án. Trước khi sửa, chốt phạm vi được duyệt; hành động AWS thực tế, kiểm thử gây thay đổi dữ liệu, publish, resend, redrive và cleanup cần nằm trong phạm vi được chủ dự án cho phép. Không tự thêm dịch vụ hoặc coi đề xuất dưới đây là quyết định kiến trúc đã được duyệt.

**Giới hạn quan trọng:** xác thực AWS hiện hết hạn; lệnh `aws sts get-caller-identity` không thành công. Trạng thái AWS hiện tại, IAM thực tế, subscription và chi phí **chưa xác minh**. Bằng chứng ngày 18/11 là lịch sử, không chứng minh trạng thái ngày 20/11.

Không xác nhận P0. Có **7 phát hiện P1, 6 phát hiện P2, 1 phát hiện P3**. P1: ưu tiên trước khi công bố Workshop; P2: hoàn thiện độ tin cậy và trải nghiệm; P3: bảo trì.

## 02. Baseline và cấu trúc repository

- Git root: `D:\FLASHRUSH-Serverless-Flash-Sale`.
- Application root: `D:\FLASHRUSH-Serverless-Flash-Sale\FLASHRUSH-Serverless-Flash-Sale`.
- Cấu trúc thư mục lồng nhau có trong GitHub. **Không tự flatten hoặc di chuyển source**: dễ tạo diff hàng loạt, trái yêu cầu trước đó của chủ dự án.
- Working tree sạch trước và sau audit. Việc xuất báo cáo này bổ sung một file mới ngoài baseline.
- Các đường dẫn trong báo cáo, trừ khi ghi rõ, tính từ application root. Số dòng tham chiếu thuộc baseline, có thể thay đổi sau khi sửa.

| Thành phần | File / hiện trạng |
|---|---|
| Backend | `backend/app.py`: API, enqueue, worker, process chung một file |
| Backend tests | `backend/test_app.py`: 4 unittest/Moto |
| Dependency Python | `backend/requirements-dev.txt`: version ranges, chưa có lockfile |
| Deploy | `scripts/deploy/deploy.py`: sinh và thực thi CloudFormation |
| Publish | `scripts/deploy/publish.py`: seed catalog, build HTTP mode, upload, invalidate |
| Live verify | `scripts/deploy/verify.py`: tạo dữ liệu, POST đơn, gửi SQS; **có mutation** |
| Recovery | `scripts/ops/reconcile_pending.py`: mặc định scan/report; `--resend` có mutation |
| Infrastructure | `infrastructure/templates/flashrush.json`: 29 resources |
| Operations | `docs/operations/aws-lab.md` |
| Requirements | `docs/requirements/system-overview.md`: Revised Draft, phê duyệt còn Pending |
| Frontend | React/Vite; storefront/orders có HTTP integration; Admin/Monitoring vẫn mock |
| Workshop | `workshop/5-Workshop/_index.md`, `_index.vi.md` rỗng |
| CI | `.github/workflows/.gitkeep`, chưa có workflow |

README ở Git root có nội dung; README tại application root rỗng. CONTRIBUTING, REPOSITORY_STRUCTURE, `.editorconfig`, `.env.example`, PR template còn rỗng; các thư mục backend scaffolding phần lớn chỉ có `.gitkeep`.

## 03. Kiến trúc và hợp đồng hiện có

Chín nhóm dịch vụ ứng dụng: **S3, CloudFront, API Gateway, Lambda, DynamoDB, SQS, IAM, CloudWatch, SNS**. CloudFormation là công cụ triển khai, không tính thành dịch vụ ứng dụng thứ mười. Không tự bổ sung EC2, RDS, Cognito, EventBridge hoặc VPC.

API hiện có:

- `GET /products`, `GET /products/{productId}`.
- `POST /orders`, `GET /orders/{orderId}`.
- Quantity chỉ nhận integer `1`; idempotency key là UUIDv4 canonical lowercase.
- Order ID: `ord_` + 32 ký tự đầu SHA256 của `flashrush-demo:v1:` + key. Lưu hash key và canonical payload; conditional Put tạo PENDING.
- Enqueue lease 30 giây, tối đa 3 lần gửi; conditional ownership; mọi send error lưu UNKNOWN; replay SENT được chấp nhận.
- Terminal replay trả 200; ACK/SENT trả 202; enqueue chưa rõ trả 503; payload conflict 409; thiếu/sai order token trả 404.
- Worker bỏ qua terminal order. Transaction decrement stock và PENDING→CONFIRMED; transaction riêng kiểm tra thiếu stock và chuyển OUT_OF_STOCK.
- Technical failure trả `batchItemFailures`; không tự chuyển FAILED. DLQ không đồng nghĩa order FAILED.
- Catalog Scan có pagination, đọc hết bảng catalog nhỏ.

Thông số template: Lambda Python 3.12 ARM64, 256MB, timeout 15s; SQS visibility 90s, main retention 4 ngày, DLQ 14 ngày, maxReceiveCount 5, batch 1, window 0, ReportBatchItemFailures, maxConcurrency 5. API throttle 5rps/burst 10; log retention 7 ngày. Alarm: DLQ depth ≥1, worker errors ≥1, queue age ≥300s. S3 bật Block Public Access, AES256, HTTPS-only, CloudFront OAC. CloudFront fallback cả 403/404 sang index.html 200. Runtime IAM tương đối giới hạn resource; chưa có operator role hoặc SNS subscription trong template.

Các lệch hợp đồng cần đội thiết kế xem xét: Overview S12 phân biệt RETRY_REQUIRED/UNKNOWN, code hiện luôn UNKNOWN khi send error; error spec có requestId, response hiện thiếu; correlation/structured logs còn ít. Không tự sửa semantics trước khi thống nhất baseline.

## 04. Kiểm chứng và bằng chứng

### Đã chạy trong audit ngày 20/11

| Kiểm tra | Kết quả / giới hạn |
|---|---|
| Python unittest discovery | 4/4 pass, local/Moto |
| Frontend tests | 26/26 pass, 5 files |
| Frontend build | Pass, default mock mode; không publish |
| npm audit | Registry báo 0 vulnerabilities tại thời điểm kiểm tra |
| Template và generator | Khớp khi dùng recorded bucket/code key |
| ZIP backend local | Hash khớp code key; app.py chỉ khác CRLF/LF, nội dung chuẩn hóa giống source |
| Secret pattern scan | Không thấy access-key/private-key patterns trong tracked snapshot; không phải toàn Git history |
| GitHub Actions secrets | Không có repository secrets được liệt kê; chưa kết luận org/environment |
| AWS identity | Fail vì session hết hạn; live AWS chưa xác minh |

ZIP SHA256: `544905d3fee1bfb573e83065a0ff84af143e988aff86d5a9d0711d73d87e4ff0`.

Version ghi nhận: boto3/botocore 1.44.5, Moto 5.2.5, awscrt 0.38.0; frontend lockfile React/DOM 19.3.1, react-router-dom 7.18.5, Vite 7.3.8, Vitest 5.1.0, TypeScript 5.9.3, Tailwind 4.3.5. README frontend nói 5 high vulnerabilities là thông tin cũ.

### Bằng chứng lịch sử trong `tests/evidence/`

| File | Điều chứng minh / giới hạn |
|---|---|
| `aws-3bf9033f.json` | Run 18/11/2026 06:48:29 UTC: 100 unique orders accepted/terminal; 10 CONFIRMED, 90 OUT_OF_STOCK, 0 PENDING, 0 FAILED; stock 10→0; elapsed 224.26s |
| Cùng file | Intake 113 attempts: 100×202 +13×429. Script max_workers=10, **không phải concurrency 100**; elapsed không phải p95 latency; số attempts không bao gồm mọi request kiểm tra sau đó |
| Cùng file | replaySameOrder, missingTokenDenied, correctTokenAllowed, payloadConflict, duplicateMessageNoDecrement, catalogRead đều true; là aggregate, chưa có raw snapshots hoặc manifest gắn commit/artifacts |
| `browser-smoke.json` | Historical Edge flow homepage→Sony→checkout→processing→confirmed; stock 3→2; chưa lưu screenshot/trace |
| `deployed-stack.json` | Historical UPDATE_COMPLETE và outputs; chưa có release manifest |
| `dlq-final.json` | Approximate DLQ count=0; không chứng minh retry→DLQ đã được thử |
| `sns-alarm-smoke.json` | Historical alarm action thành công; chưa kiểm tra thư thực nhận trong inbox |

Mock dashboard 100/10/88/2 là dữ liệu khác, không được dùng thay live result 100/10/90/0. Chưa có current rendered responsive validation.

## 05. Danh sách phát hiện và tiêu chí nghiệm thu

### F01 — P1 — Cấu hình môi trường và guard sai target

**Owner đề xuất:** DevOps. `deploy.py:113–146` có profile/region, nhưng `publish.py:14–15`, `verify.py:14–15` hardcode; stack cố định. Có nguy cơ deploy một môi trường nhưng publish/test môi trường khác.

**Xử lý:** thống nhất config profile/region/stack và kiểm tra account/region/outputs trước mutation. **Nghiệm thu:** mọi entrypoint dùng cùng config; sai account/region/stack dừng trước mutation; tài liệu có lệnh mẫu và config resolution rõ ràng.

### F02 — P1 — Recovery PENDING thiếu tuổi và escalation

**Owner:** Backend/DB/Queue + DevOps. `reconcile_pending.py:24–35` quét toàn bộ PENDING; chưa lọc tuổi, báo tuổi/attempt, hoặc exit unresolved. Queue/DLQ/Lambda alarm không phát hiện order chưa từng enqueue.

**Xử lý:** thống nhất threshold, report overdue/attempt/outcome, escalation, operator IAM; chưa cần thêm dịch vụ. **Nghiệm thu:** phân biệt PENDING mới/overdue, dry-run chỉ đọc, resend có điều kiện, unresolved thể hiện qua report/exit; chứng minh không tạo decrement trùng.

### F03 — P1 — Duplicate-message live test chưa chứng minh tiêu thụ

**Owner:** QA/Backend. `verify.py:78–83` gửi duplicate rồi sleep 5s, kiểm stock vốn đã bằng 0; test có thể pass dù message chưa được worker xử lý.

**Xử lý:** fixture còn stock, chứng minh duplicate đã được tiêu thụ trước assertion. **Nghiệm thu:** bằng chứng xử lý message và order terminal không đổi; stock không decrement lần hai; timeout xử lý phải fail test.

### F04 — P1 — Thiếu fault/concurrency coverage

**Owner:** QA/Backend. Chưa đủ case cùng key đồng thời, ACK accepted rồi timeout, transaction conflict/throttle, lease race, retry→DLQ/redrive thực. Poison unittest chỉ chứng minh partial response.

**Nghiệm thu:** test matrix có setup, expected state/invariant, kết quả và evidence cho từng case; mọi order có thể giải thích; không oversell/decrement trùng. Local fault injection trước; live fault tests chỉ trong phạm vi được duyệt.

### F05 — P1 — Thiếu provenance xuyên suốt release

**Owner:** DevOps/QA. Chưa nối commit→template/code hashes→stack/version→test/raw evidence bằng manifest. Local artifacts khớp chỉ là bằng chứng một phần.

**Nghiệm thu:** manifest ghi commit, clean/dirty state, UTC, account/region/stack, hash artifacts/template, runtime/dependencies, commands/run IDs, outputs và evidence paths; đủ đối chiếu release được test với release được deploy; không lưu secrets.

### F06 — P1 — Cleanup chưa tái lập và chưa kiểm chứng

**Owner:** DevOps/QA. `aws-lab.md:65` chỉ có đoạn hướng dẫn chung; nonempty S3, artifact bucket ngoài stack, subscription riêng chưa có quy trình ownership đầy đủ.

**Nghiệm thu:** inventory ownership + account/region allowlist; trình tự xóa có kiểm soát, xử lý bucket versions nếu có, stack failure, subscription và artifact ngoài stack; xác minh resource còn sót; ghi rõ billing cập nhật trễ. Không khẳng định chi phí <5 USD hoặc bằng 0 khi chưa có dữ liệu. Chỉ rehearsal cleanup sau khi được cho phép.

### F07 — P1 — Thiếu kiến trúc v1.1 và phê duyệt baseline

**Owner:** Lead/Architect. Không tìm thấy v1.1 `.drawio`/PNG trong repo và Downloads đã tìm. Chỉ có `D:\Downloads\architecture(bancu).png`, nhãn V1.0. Overview dòng 4/10 và 1090–1110 còn Pending.

**Nghiệm thu:** baseline kiến trúc phản ánh routes/token, enqueue lease/recovery, operator/artifacts/config; version và quyết định được người có thẩm quyền xác nhận. Không ghi Approved thay họ; Jira chưa được kiểm tra.

### F08 — P2 — Chưa có nền Hugo chạy được

**Owner:** Writer/Web. Index Workshop rỗng; chưa có config/theme/site root/navigation.

**Nghiệm thu:** thống nhất host và cấu trúc Hugo, build thành công, navigation/song ngữ hoạt động; chốt image root trước viết hàng loạt.

### F09 — P2 — Thiếu screenshots kỹ thuật

**Owner:** QA/Writer. Repo chỉ có 13 JPG merchandise và Unsplash SOURCES; không có ảnh AWS/terminal/frontend/cleanup.

**Nghiệm thu:** ảnh thật, nguồn/run/time rõ, redact phù hợp, liên kết đúng bước; không dùng mock làm bằng chứng AWS hoặc dựng ảnh giả.

### F10 — P2 — Tài liệu và đường dẫn lỗi thời

**Owner:** Writer + từng module owner. Git-root README links dòng 88, 262, 266, 267 lỗi; cwd hướng dẫn sai; frontend README nói checkout chưa có; ORDER_HANDOVER vẫn nói products mock dù đã tích hợp HTTP.

**Nghiệm thu:** links/cwd chạy đúng theo cấu trúc hiện có; tài liệu phân biệt mock, HTTP, lịch sử và live; không di chuyển source để chữa links.

### F11 — P2 — Frontend chưa thống nhất mode và quantity

**Owner:** Frontend/Backend. Home/Listing countdown/categories còn import mocks trong HTTP mode; `Checkout:21` cho quantity>1 trong khi `app.py:148` chỉ nhận 1; adapter chưa validate JSON.

**Nghiệm thu:** UI và API thống nhất quantity; dữ liệu mock được ghi rõ; HTTP mode không ngụ ý mock là dữ liệu live; response bất hợp lệ có xử lý lỗi phù hợp. Test contract tập trung các ranh giới này.

### F12 — P2 — Publish chưa có trình tự release/rollback rõ

**Owner:** DevOps/Frontend. `publish.py:18–38` seed trước build; upload không đảm bảo assets trước index; SPA fallback có thể che lỗi asset bằng HTTP 200.

**Nghiệm thu:** build/validate trước mutation; assets sẵn sàng trước index; kiểm tra asset response/content type; rollback tái lập; route SPA hợp lệ vẫn hoạt động, asset mất không giả thành HTML thành công.

### F13 — P2 — Reproducibility và CI còn thiếu

**Owner:** DevOps/Backend. Chưa CI, Python dùng ranges, Lambda SDK phụ thuộc bundled runtime.

**Nghiệm thu:** dependency/runtime strategy được ghi rõ; workflow offline tests/build/template checks; lưu versions/hashes phù hợp; clean checkout tái lập được theo hướng dẫn. Không chạy live mutation tự động ngoài phạm vi duyệt.

### F14 — P3 — Khó bảo trì và scaffolding dư

**Owner:** Module owners/Writer. JSX có dòng rất dài, scaffold cũ, Overview markdown bị dàn phẳng.

**Nghiệm thu:** format và entrypoint dễ đọc; tài liệu cấu trúc khớp code; không trộn refactor lớn vào sửa P1; chỉ dọn scaffold sau khi thống nhất phạm vi.

## 06. Phân công và thứ tự triển khai đề xuất

Mapping SCRUM dưới đây **chỉ là đề xuất theo context trước đó**, chưa xác minh nội dung ticket trên Jira, chưa cập nhật bất kỳ ticket nào.

| Thứ tự | Owner | Phạm vi | SCRUM đề xuất | Phụ thuộc |
|---|---|---|---|---|
| 1 | Lead/Architect | F07 baseline/semantics | SCRUM-6 | Người phê duyệt |
| 2 | DevOps | F01 config/target guards | SCRUM-8/9 | Baseline môi trường |
| 3 | Backend/DB/Queue | F02 recovery | SCRUM-10/11 | Threshold/semantics |
| 4 | QA/Backend | F03/F04 tests | SCRUM-9/10/11/13 | F01, F02 |
| 5 | DevOps/QA | F05 release manifest | SCRUM-8/13 | Dùng chung cho mọi run |
| 6 | DevOps/QA | F06 cleanup | SCRUM-8/13 | Ownership + phạm vi live |
| 7 | Frontend/DevOps | F11/F12 | SCRUM-12/8 | API contract + config |
| 8 | DevOps/Backend | F13 CI/reproducibility | SCRUM-8/13 | Entry points ổn định |
| 9 | Writer/Web | F08/F10 | SCRUM-6/12/13 | Host Hugo + baseline |
| 10 | QA/Writer | F09 evidence/images | SCRUM-13 | Release/run được duyệt |
| 11 | Module owners | F14 tùy chọn | Chưa gán | Tách khỏi critical path |

Chưa ước lượng effort vì chưa chốt phạm vi, quyền và ADR. Mỗi đội bàn giao: commit/PR, finding IDs đã xử lý, test commands/results, evidence/manifest, hạn chế còn lại. Không báo Done chỉ dựa trên thay đổi source khi tiêu chí cần live verification.

## 07. Mức sẵn sàng Workshop 5.1–5.6

| Phần | Source | Technical readiness | Evidence readiness |
|---|---|---|---|
| 5.1 | PASS | PARTIAL | PARTIAL |
| 5.2 | PARTIAL | PARTIAL | NOT VERIFIED |
| 5.3 | PASS | PARTIAL | PARTIAL |
| 5.4 | PASS | PARTIAL | PARTIAL |
| 5.5 | PASS | PARTIAL | PARTIAL |
| 5.6 | PARTIAL | PARTIAL | NOT VERIFIED |

Hugo và screenshots: **FAIL cho toàn bộ** tại thời điểm audit. Source PASS chỉ nghĩa có code nền để viết, không có nghĩa tài liệu hoàn thành hoặc live AWS đã pass.

## 08. Kế hoạch thu thập ảnh và evidence

Chưa tạo các ảnh dưới đây; chốt image root cùng host Hugo trước khi capture.

1. Baseline architecture được duyệt, version rõ.
2. Account/region/quota/budget: chụp sau xác thực, không suy diễn chi phí.
3. CloudFormation resources/outputs khớp manifest.
4. S3 Block Public Access, OAC, bucket policy, HTTPS.
5. SQS main/DLQ, retry/retention/visibility settings.
6. IAM runtime/operator và Lambda event source mapping.
7. Deploy/build result và browser flow HTTP thật.
8. Load result, raw order/stock snapshots, invariant và duplicate consumption.
9. CloudWatch logs/alarms, retry→DLQ/redrive trong phạm vi được duyệt.
10. SNS subscription/action; inbox receipt chỉ xác nhận nếu thực sự quan sát.
11. PENDING overdue/recovery, before/after và unresolved report.
12. Cleanup inventory, kết quả resource verification và billing sau độ trễ phù hợp.

Mỗi bộ evidence cần run ID, UTC, commit/artifact hashes, môi trường, commands, expected/actual, raw outputs đã loại secrets. Không công bố access keys, session tokens, order access tokens hoặc dữ liệu riêng tư.

## 09. Môi trường lịch sử để đối chiếu

**Chỉ là dữ liệu lần triển khai 18/11; không xác nhận còn tồn tại.**

| Thuộc tính | Giá trị lịch sử |
|---|---|
| AWS profile / principal | `dropit-admin` / `AdminUser` |
| Account / region | `303278700480` / `us-east-1` |
| Stack / prefix | `flashrush-lab` / `flashrush-lab-` |
| Website | https://d3iqr833zkimb.cloudfront.net |
| API | https://6bxtg6foxl.execute-api.us-east-1.amazonaws.com |
| CloudFront distribution | `E1W17WY4FUJC33` |
| Tables | `flashrush-lab-products`, `flashrush-lab-orders` |
| Queues | `flashrush-lab-orders`, `flashrush-lab-dlq` |
| Website bucket | `flashrush-lab-web-303278700480-us-east-1` |
| Artifact bucket ngoài stack | `flashrush-lab-artifacts-303278700480-us-east-1` |
| SNS topic | `arn:aws:sns:us-east-1:303278700480:flashrush-lab-alerts` |
| Alert email | `hoanghaip2005@gmail.com`, confirmed theo lịch sử |

Lambda account concurrency lịch sử: 10; SQS maximum concurrency: 5; không reserved concurrency. Không tự chạy `verify.py`, `--resend`, publish hoặc cleanup để kiểm tra các giá trị trên.

## 10. Cổng nghiệm thu và bước tiếp theo

**Stage A — Khắc phục:** chủ dự án chọn/duyệt phạm vi; đội phụ trách xử lý finding, hoàn thiện baseline, config, recovery, tests, manifest và cleanup plan. Live actions cần phạm vi rõ; không suy diễn quyền từ báo cáo audit.

**Stage B — Viết Workshop:** sau khi đủ baseline/evidence, viết song ngữ 5.1–5.6 theo host đã chốt, gắn source và ảnh thật, ghi rõ chi phí/giới hạn và mọi bước gây mutation.

**Stage C — QA phát hành:** Hugo build, links/images/navigation/song ngữ, walkthrough từ clean checkout, đối chiếu manifest; cleanup walkthrough sau phê duyệt; kiểm tra resource/billing theo thời điểm thực.

Điều kiện chuyển sang GO đầy đủ: P1 đã xử lý và nghiệm thu hoặc có quyết định chấp nhận rủi ro bằng văn bản; AWS current state được xác minh; kiến trúc được phê duyệt; Workshop build/walkthrough tái lập; evidence và cleanup đủ truy vết. Mọi mục chưa xác minh phải tiếp tục ghi rõ, không đổi thành PASS bằng suy đoán.

**Trạng thái bàn giao:** báo cáo tổng hợp đã xuất file. Các đề xuất chưa được thực hiện. Không có cập nhật Jira hay triển khai AWS phát sinh từ việc xuất báo cáo.
