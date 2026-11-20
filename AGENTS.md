# Hướng dẫn cho agent

- Đọc ticket hiện hành và Test Contract trước khi sửa. Ghi giả định và cách kiểm chứng trong docs.
- Logic dùng chung ở `src/night-game.mjs`, bản đồ ở `src/nights.mjs`, tuning ở `game.contract.json`. Giữ 60 tick/giây và phân biệt tick với sim_tick khi pause. Giữ thứ tự cập nhật của v1.1. Khoảng cách dùng XZ. Chiều cao tách tương tác giữa các tầng của Đêm 3.
- Khi đổi luật, ghi tiêu chí và giả định trong `docs/phase-2.md`. Chạy `npm run verify:phase2` để kiểm tra tự động và đo một lượt 21.600 tick.
- Chạy `npm test` trước khi kết thúc. Nếu test đỏ, sửa hoặc ghi rõ mục chưa đạt. Chạy `npm start` để kiểm tra luồng giao diện khi sửa HUD, input hoặc camera.
- Bằng chứng phải lấy từ chương trình thật và khớp commit bàn giao. Ghi lý do khi một ticket mới thay thế test cũ.
