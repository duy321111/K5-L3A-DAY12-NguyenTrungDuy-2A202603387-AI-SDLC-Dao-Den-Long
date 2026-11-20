# Phase 1 — PRD-0

## Giả định

- Đảo chuẩn headless có bán kính 32 m và mặt đất Y = 0. Bản web mở rộng lên 48 m và có địa hình thay đổi theo vị trí. Rìa đảo chặn bước chân. Nhảy chỉ đổi độ cao, mọi tương tác dùng mặt phẳng XZ.
- Trận kéo dài 180 giây, ba lửa. Khởi tạo 65 đom đóm và ba Bóng Mực. Bản chơi web dùng seed 2026 để có thể thử lại cùng màn. Headless dùng seed truyền qua CLI.
- E nạp vào đèn chưa sáng gần nhất. Mỗi lần bấm nạp tối đa số đom đóm còn thiếu. Có thể nạp nhiều đợt. Đèn sáng tạo vùng an toàn.
- Q tốn hai đom đóm, làm choáng và đẩy các Bóng Mực ở gần. Mây không làm rơi đom đóm khi bị chạm. Điểm thưởng thời gian làm tròn xuống theo giây, chỉ cộng khi thắng.
- Thứ tự mỗi tick là di chuyển, nhặt, nạp, tỏa sáng, Bóng Mực di chuyển và va chạm, xét kết thúc. Các đèn có sẵn trong scenario không cộng điểm.
- Mảng scenario có mặt thay thế toàn bộ danh sách tương ứng. Thông số nằm trong game.contract.json.

## Kiểm chứng

| Yêu cầu | Cách kiểm chứng |
|---|---|
| Tick 0, bước mô phỏng, camera, vector và nhảy | Test CLI kiểm tra snapshot 0, 60, 61 |
| Nhặt, sức chứa, nạp đèn và thắng | Test CLI đối chiếu event, lượng nạp, điểm, tick kết thúc |
| Bóng Mực, xung sáng, bất tử, vùng an toàn, bình minh | Test CLI đối chiếu tọa độ, trạng thái, sát thương và lý do thua |
| Tính tất định, định dạng JSONL và lỗi đầu vào | Test CLI so sánh byte và mã thoát |
| Màn chuẩn headless | Phát lại đường chơi với seed 2026 qua CLI, thắp đủ 5 đèn và thắng ở tick 1683 với 1162 điểm |
| HUD, camera, chơi lại | Có thể kiểm tra trực tiếp qua `npm start`. Kiểm chứng tự động ở đây chỉ xác nhận logic dùng chung. |

Kết quả tự động được lưu trong [phase-1-tests.txt](proof/phase-1-tests.txt). Các test gọi CLI thật qua tiến trình con.

## Nhật ký AI

Codex đọc PRD-0, viết lõi gameplay, giao diện, CLI và kiểm chứng. Cùng một cấu hình tuning và lõi mô phỏng phục vụ hai chế độ để giảm công sức kiểm thử. Ước tính khoảng 12.000 token cho lượt triển khai và kiểm tra, không lấy từ bộ đếm của nhà cung cấp. File AGENTS.md ghi lệnh kiểm thử và quy ước giữ bằng chứng.
