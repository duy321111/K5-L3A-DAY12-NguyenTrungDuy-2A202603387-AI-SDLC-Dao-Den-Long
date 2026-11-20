# ADR Phase 3 — Dầu đèn và bình minh

## Quyết định

Mỗi đèn giữ trạng thái sáng, số đom đóm đã nạp, dầu, lịch sử từng sáng và số lần thắp lại. Dầu lưu bằng bội số nguyên của 1/60 đơn vị. Dầu hao tự nhiên và dầu do Bóng Mực hút được trừ cùng lúc ở đầu bước mô phỏng. Đèn cạn chuyển sang tắt ngay và đặt lại số đom đóm đã nạp. Giao diện đọc trạng thái này trực tiếp từ lõi mà CLI sử dụng.

Chỉ kết thúc khi Mây hết Ngọn Lửa hoặc thời gian tới bình minh. Ở tick cuối, xử lý hết gameplay rồi kiểm tra Ngọn Lửa trước, số đèn đang sáng sau. Tính phần thưởng bằng lượng dầu thực còn lại trước khi ghi kết quả thắng. Nhờ đó, đèn tắt hoặc được thắp lại trong tick cuối đều được tính đúng.

Bóng Mực trong trạng thái hút lưu đèn mục tiêu và số tick hút liên tiếp. Mỗi lần hút có hiệu lực dựa trên trạng thái ở đầu bước. Châm lên ngưỡng 30 hoặc thắp đèn tạo chuyển động đẩy riêng trong tối đa 30 tick. Bóng Mực đang bị đẩy không gây sát thương. Vùng chặn Bóng Mực thông thường giữ bán kính tuning Phase 2. Bán kính 6 m được dùng khi đẩy và khi Bóng Mực đang hút phát hiện Mây.

## Kiểm chứng

- CLI có ca hao dầu đúng tick, cạn dầu, thắp lại, châm dầu, ngưỡng 30, chọn mục tiêu theo khoảng cách và id, hai Bóng Mực hút cùng lúc, điểm Tỏa Sáng và dầu trong lúc tạm dừng.
- CLI thử cả ba ngưỡng thắng, đèn cạn ở tick cuối và thứ tự ưu tiên thua do hết Ngọn Lửa. Các ca chuyển động, Lướt, Bùa Gió, Gió Lạc, cầu và địa hình Phase 2 vẫn chạy.
- Ca Phase 2 thắng ngay khi thắp đủ đèn được thay bằng ca xác nhận game vẫn tiếp tục và chỉ xét thắng ở bình minh. Ca giữ E vẫn kiểm tra cạnh lên, nhưng lần bấm sau giờ có thể châm cho đèn vừa thắp theo thứ tự id. Ca điểm cũ được cập nhật theo công thức v1.2.
- Chạy lại bằng `npm test`. Xem [kết quả test CLI](proof/phase-3-tests.txt) và [kiểm chứng Chrome](proof/phase-3-browser.txt). Test ẩn của giảng viên chưa được cung cấp.
