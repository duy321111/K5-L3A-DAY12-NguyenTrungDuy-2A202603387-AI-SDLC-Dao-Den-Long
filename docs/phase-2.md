# Phase 2 — Ticket-02

> Cập nhật sau khi dựng tag: đã nhận bảng RGB và bảng số liệu chuẩn. Bản cập nhật áp dụng các giá trị đã nhận. Với v1.1, thời lượng chuẩn là 300/330/360 giây. Bản v1.3 tiếp tục dùng 240/270/300 giây và luật thắng bình minh của Ticket-03. Các số chính đã được đối chiếu với hai bảng người dùng bổ sung.

## Tiêu chí nghiệm thu và bằng chứng

| Yêu cầu | Tiêu chí | Bằng chứng |
|---|---|---|
| Gió Lạc | Có ở Đêm 2–3, sinh từ tick 1200 và tối đa hai con hoạt động. Đuổi khi đủ điều kiện, cướp tối đa ba, không gây mất Lửa. Tỏa Sáng xua hoặc làm rơi lại đồ. | CLI kiểm tra mốc sinh, thứ tự cướp trước sát thương, dữ liệu sự kiện và đom đóm rơi. |
| Bùa Gió | Đúng vị trí mặc định. Có hiệu lực 600 tick, vận tốc đi 7,2 m/s, bỏ hồi chiêu Lướt, hồi bùa sau 2700 tick. | CLI kiểm tra nhặt, hai lượt Lướt liên tiếp, chiều dài Lướt, hết hiệu lực và hồi bùa. |
| Chuỗi ba Đêm | Menu, lời Ông Đăng, chơi, kết quả và Đêm kế tiếp. Thua có thể chơi lại. Thắng Đêm 3 hiện Bình Minh và tổng điểm của các đêm đã thắng. | Chrome kiểm tra chuyển màn thắng bằng cách đặt đèn sáng trong phiên thử giao diện. CLI phát lại lượt chơi thắng Đêm 1 với các input bình thường. |
| Tạm dừng | Esc/P mở Tiếp tục, Chơi lại Đêm, Cài đặt, Về menu. Headless giữ nguyên sim_tick, thời gian và bộ đếm khi pause. | Chrome kiểm tra menu tạm dừng. CLI kiểm tra paused/resumed, TTL và hồi chiêu. |
| Cài đặt | Âm lượng và độ nhạy chuột thay đổi được và lưu trong localStorage. | Chrome kiểm tra thay đổi thanh độ nhạy và giá trị lưu. Âm lượng được nối với mô-đun Web Audio. |
| Âm thanh | Nhạc nền và hiệu ứng nhặt, thắp, tỏa, trúng đòn, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện và 10 giây cuối. Cảnh báo gió phát trước 2 giây. | Các sự kiện nối đến Web Audio trong `src/sound.mjs`. Chưa nghe kiểm tra đầy đủ từng hiệu ứng. |
| HUD | Ngọn Lửa, đồng hồ giữa màn hình đỏ khi ≤30 giây, đèn, điểm, 10 ô đom đóm, hồi chiêu, lời nhắc nạp và mũi tên tới đèn gần nhất ngoài màn hình. | Chrome chạy HUD thật trên cả ba Đêm. Chưa rà trực quan từng trạng thái HUD. |
| Màu và ánh sáng | Dùng RGB chuẩn trong giới hạn ±10% mỗi kênh. Ánh sáng môi trường tăng theo `0.15 + 0.55 × tỷ lệ đèn sáng`. | Công thức được áp dụng trong trình vẽ. Màu cơ sở lấy từ bảng RGB Ticket-02 trong `src/palette.mjs`. Cường độ môi trường dùng đúng công thức. Pixel chịu ánh sáng và sương. |
| Bản đồ chuẩn | Đêm 1 có 5 đèn và rơi ở rìa. Đêm 2 qua cầu tre và hai bục phóng. Đêm 3 có ba tầng, vách, dốc, bục phóng, tháp và gió theo lịch. | CLI kiểm tra rơi, đi qua cầu, phóng liên đảo, đi dốc, rơi từ tầng cao và đáp trên tầng 2. |
| Contract v1.1 | CLI nhận Đêm 1–3, giữ đầu ra JSONL tất định, validate input/scenario và xuất snapshot, event mới. | Chạy `npm run verify:phase2`. Có 16 bài test gồm các ca hồi quy Phase 1 đã điều chỉnh theo luật mới. Test ẩn của giảng viên chưa có để chạy. |
| Hiệu năng | 21.600 tick headless ≤30 giây và bản chơi ≥30 FPS ở 1280×720. | [Log headless và cấu hình máy](proof/phase-2-tests.txt). [Log Chrome headless](proof/phase-2-browser.txt) đo khoảng 1,8 giây ở đầu mỗi Đêm với canvas toàn màn hình 1280×720. |

## Thông số đã cập nhật

Dùng thông số chuẩn của Ticket-02 cho vận tốc, nhảy, lướt, nhặt, hồi chiêu, vùng an toàn, lịch sinh và sát thương. Contract v1.1 dùng 300/330/360 giây. Contract v1.2 giữ thời lượng và luật bình minh thay thế trong Ticket-03. Quầng sáng và màu vật liệu dùng bảng RGB mới. Va chạm đá và địa hình mở rộng vẫn dành cho bản web.

## Nhật ký AI và thay đổi hồi quy

Codex triển khai lõi dùng chung, scenario v1.1, giao diện, âm thanh và bằng chứng. Ước tính 20.000 token cho triển khai và kiểm chứng, không lấy từ bộ đếm của nhà cung cấp. Tái sử dụng trình vẽ, điều khiển và các ca kiểm chứng Phase 1 để giảm phần phải viết lại. Test điểm được cập nhật vì v1.1 tính điểm theo lượng nạp, test đường chơi được cập nhật vì số đèn, số đom đóm, lịch sinh địch và cơ chế Lướt thay đổi. Lần kiểm tra Chrome đầu bị timeout ở DevTools. Lần xác minh thành công dùng một profile tạm cho game local.

Harness gồm `AGENTS.md`, `npm run verify:phase2` và script đo headless. Chưa commit hoặc tạo tag Phase 2.
