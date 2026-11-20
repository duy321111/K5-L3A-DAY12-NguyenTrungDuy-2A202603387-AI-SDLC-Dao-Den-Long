# Phase 4 — Bằng chứng v1.0.0

| Hạng mục | Kết quả local |
|---|---|
| Benchmark cửa sổ | 30 giây đo sau 3 giây khởi động. Canvas 1280×720, 200 Bóng Mực, 100 đom đóm. 60,06 FPS trung bình, 58,77 FPS 1% thấp, p95 16,8 ms, tải 6.643 ms. Xem [bench.json](../bench.json). |
| Soak | Mười Đêm trong một tiến trình, 0 crash. RSS 32,62 → 35,96 MB, bằng khoảng 110,24% mức đầu. Xem [soak.json](../soak.json). |
| Headless và hồi quy | 29/29 test local đạt, gồm bài xuất bảng điểm qua tiến trình mới. Xem [log test](proof/phase-4-tests.txt). Test ẩn của giảng viên chưa được cung cấp. |
| Giao diện | Chrome kiểm tra chữ 18/22,5 px, chặn trùng phím, lưu đổi phím, khôi phục mặc định, lưu điểm và xem lại sau tải lại. Trạng thái thua để kiểm tra form được dựng trong phiên test. Xem [log trình duyệt](proof/phase-4-browser.txt) và [ảnh game](proof/gameplay.png). |
| Demo | [MP4](demo/demo.mp4) dùng khung hình từ toàn bộ trang game trong Chrome, gồm cả HUD gốc. Phần số liệu kiểm thử xuất hiện sau đoạn chơi. Clip 1280×720 dài khoảng 13,09 giây. |
| Đóng gói | Gói zip local chứa thư mục game, Node server, mã headless và thư viện Three.js đã chép sẵn. Chạy `node server.mjs` trong thư mục đã giải nén. Gói thư mục được mở trong Chrome từ đường dẫn riêng. |
| Bàn giao GitHub | Tệp nguồn, báo cáo, demo và gói đã chuẩn bị ở local. Tag local `phase-4` và `v1.0.0` cập nhật theo bản này. Chưa kiểm tra quyền xem công khai, push hay phát hành Release. |

## Môi trường đo

Windows x64 10.0.26200, Intel Core i5-1235U, Intel Iris Xe Direct3D 11, RAM khả dụng khoảng 7,7 GiB, Node.js 26.13.1, Chrome 157.0.8103.80, Three.js r187. Chrome mở cửa sổ, giữ nhịp requestAnimationFrame/VSync. Không đo được RSS đỉnh từ trang web. Chế độ nguồn chưa được ghi nhận. Kết quả này dùng tham khảo và chưa được xác nhận trên máy chấm.

Chrome mặc định trong sandbox local thoát trước khi mở cảnh. Lần đo phần cứng đã chạy với `BENCH_NO_SANDBOX=1` **chỉ trong môi trường kiểm thử local**. Khi chạy Chrome bình thường bên ngoài sandbox công cụ, dùng lệnh README với thiết lập sandbox mặc định của Chrome. Lần thử bằng SwiftShader cho 3,06 FPS trung bình và 2,61 FPS 1% thấp. Kết quả chính dùng GPU Intel, không lấy số từ SwiftShader.

Chỉ giữ tinh chỉnh runtime Node trong soak: dùng `--jitless`, nursery 1 MB và GC trước khi đo mỗi mốc để giảm chênh do biên dịch tối ưu V8. Vòng lặp vẫn dùng mô phỏng đầy đủ với các xác suất và seed trong ticket.
