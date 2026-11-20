# Changelog

## Phase 4 — Bình minh, v1.0.0

- Contract v1.3 thêm lệnh benchmark cửa sổ và soak headless trong một tiến trình.
- Bảng xếp hạng top 10 lưu trên đĩa và có lệnh xuất JSON.
- Thêm đổi phím, phụ đề gameplay, mũi tên báo Bóng Mực, giảm chuyển động và chữ lớn.
- Thêm gói chạy độc lập với trình cài npm, video, số đo và retro.

## Phase 3 — Đèn cạn dầu

### Thay đổi không tương thích

- Contract chuyển từ v1.1 sang v1.2. Snapshot thêm `capacity`, `fuel`, `ever_lit` và `relit_count`. Bóng Mực có thêm trạng thái `drain`.
- Đèn sáng nhận châm dầu. Đèn cạn có thể tắt và được thắp lại bằng 5 đom đóm. Đèn mới cần 10 trong cả bản web và headless.
- Sự kiện `lantern_lit` thêm `relight`. Có thêm `refuel`, `lantern_out` và `fuel_drain`. Kết quả thắng dùng `dawn_survived`.
- Đêm kéo dài 240, 270 hoặc 300 giây. Thắp đủ đèn giữa đêm không kết thúc trận. Tới bình minh cần còn Ngọn Lửa và số đèn sáng đạt 60% làm tròn lên.
- Điểm nạp giảm còn 5 mỗi đom đóm. Thắp lại thưởng 40. Tỏa Sáng trúng Bóng Mực đang hút thưởng 15. Bỏ thưởng thời gian và thêm thưởng theo dầu còn lại lúc thắng.
- Túi bắt đầu ở 10, thêm 2 sau mỗi lần thắp thành công, tối đa 20. Giới hạn input scenario tương ứng với số lần thắp khai báo.

### Giao diện

- Thanh dầu, cảnh báo đèn yếu và trạng thái đèn tắt xẹp có vết rách trên cả WebGL và Canvas.
- Cài đặt bảng màu dễ phân biệt được lưu qua lần mở game.

## Phase 2 — Ba Đêm

- Contract v1.1 thêm Đêm 2–3, Lướt, Bùa Gió, Gió Lạc, pause, gió và các tầng địa hình.
- Giao diện có chuỗi chuyển Đêm, HUD mở rộng, âm thanh, cài đặt và renderer Three.js.

## Phase 1 — Đảo Bến

- Màn chơi đầu với năm Đèn Lồng Lớn, Bóng Mực, nhặt đom đóm và Tỏa Sáng.
- Contract v1.0 có CLI tất định, scenario, JSONL và bộ test local.
