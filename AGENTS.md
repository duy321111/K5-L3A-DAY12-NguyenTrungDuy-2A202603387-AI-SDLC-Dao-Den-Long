# Hướng dẫn cho agent

- Đọc ticket hiện hành và Test Contract trước khi sửa. Ghi giả định và cách kiểm chứng trong docs.
- Logic gameplay dùng chung ở `src/game.mjs`. Dùng `game.contract.json` làm nguồn tuning cho cả giao diện lẫn headless. Giữ mô phỏng 60 tick/giây và mọi khoảng cách gameplay theo XZ.
- Chạy `npm test` trước khi kết thúc. Nếu test đỏ, sửa hoặc ghi rõ mục chưa đạt. Chạy `npm start` để kiểm tra luồng giao diện khi sửa HUD, input hoặc camera.
- Bằng chứng phải lấy từ chương trình thật và khớp commit bàn giao. Ghi lý do khi một ticket mới thay thế test cũ.
