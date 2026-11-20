# Nguồn gốc các mốc dựng lại

Repo này được dựng lại trong thư mục riêng theo yêu cầu của tác giả. Commit và tag được tạo vào thời điểm dựng lại.

- `phase-1` dùng đúng cây mã từ commit `d44e097` tìm thấy trong repo cũ. Bộ test được chạy lại trước khi tạo tag.
- `phase-2` tái dựng Contract v1.1 từ Ticket-02 và mã có sẵn. Các giá trị không có trong bản ticket đã nhận được ghi là giả định trong ghi chép Phase 2.
- `phase-3` tái dựng Contract v1.2 với dầu đèn và thắng tại bình minh. Mốc này gồm ADR và các test đã cập nhật.
- `phase-4` dùng mã nguồn, demo và số đo có thật từ bản hoàn chỉnh làm chuẩn. Chạy lại bộ test trong repo mới. File ứng dụng và các tệp bàn giao được so sánh SHA-256 với bản chuẩn.

## Cập nhật sau khi nhận đủ bảng Ticket-02

`phase-1` giữ nguyên. Ba mốc còn lại được cập nhật sau khi nhận bảng chuẩn gameplay và RGB. Phase 2 dùng 300/330/360 giây và điều kiện thắng v1.1. Phase 3–4 giữ dầu đèn và bình minh theo Ticket-03. Báo cáo benchmark, soak và video Phase 4 được chạy hoặc ghi lại trên bản cập nhật. Các commit cũ được giữ trên một nhánh sao lưu local.
