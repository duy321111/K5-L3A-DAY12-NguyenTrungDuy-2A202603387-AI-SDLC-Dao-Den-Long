# Retro Day 12 — Đảo Đèn Lồng

## Evaluation qua bốn phase

| Phase | Kết quả và cách kiểm chứng | Phần cần cải thiện |
|---|---|---|
| 1 | Game Canvas chạy được, có headless tất định và tám test local. Ca chơi tự động thắng màn đầu có log. | Kiểm tra giao diện sau khi người dùng thấy font và cách điều khiển còn bất tiện. Quá trình commit ban đầu vượt quyền và đã được hoàn tác theo yêu cầu. |
| 2 | Tách hình học ba Đêm khỏi logic. Kiểm tra Lướt, Bùa, Gió Lạc, cầu, tầng và 21.600 tick. Ba Đêm chạy trong Chrome, các lượt chuyển màn được thử bằng scenario. | Bản ticket thiếu bảng tuning và RGB, nên một số giá trị vẫn là giả định. Kết quả local không xác nhận test ẩn. |
| 3 | Lõi đèn giữ dầu nguyên theo tick. 24 test kiểm tra mốc cạn, châm, hút, điểm và bình minh. Chrome kiểm tra cảnh báo đèn yếu và bảng màu. | Luật thắng sớm và công thức điểm bị thay thế, nên phải sửa tiêu chí nghiệm thu và test cùng lúc. Tách xác minh UI bằng scenario khỏi lượt chơi thực tế. |
| 4 | Bảng điểm trên đĩa, đổi phím, chỉ báo, báo cáo benchmark và soak, demo MP4, gói chạy thử. Test bắt lỗi lưu thứ tự điểm bằng nhau và xuất sau khởi động lại. | Số benchmark phụ thuộc GPU. Chạy bằng SwiftShader thấp hơn nhiều so với Intel Iris Xe. Cần kiểm tra lại trên máy chấm. |

## Làm việc với AI

Một lõi mô phỏng dùng chung cho headless và game là quyết định có tác dụng lớn nhất. Những yêu cầu dễ lệch như một tick cạn dầu, 30 dầu vẫn an toàn và kết quả ở bình minh được viết thành scenario. Điều này giúp kiểm chứng thay đổi về luật mà không cần chơi tay cả Đêm. Giao diện được kiểm tra riêng trong Chrome. GIF hoặc log của UI không thay thế bài test logic.

AI từng tự commit và push khi chỉ được giao triển khai. Người dùng phát hiện ngay và yêu cầu hoàn tác. Quy tắc sau đó là sửa và kiểm chứng ở local, chỉ thao tác Git khi được yêu cầu. AI cũng có lần đặt cao độ nước khiến nước lộ trong vùng trũng. Ảnh chụp WebGL giúp thấy lỗi và hạ mặt nước xuống dưới đáy địa hình. Khi chuyển sang Phase 3, test cũ còn kỳ vọng thắng sớm. Lỗi lộ qua test đỏ và được xử lý bằng cách ghi ADR rồi thay test bằng ca kiểm tra đúng tick bình minh.

## Harness và chi phí

AGENTS.md hữu ích nhất vì giữ lệnh chạy và các bất biến mô phỏng ở ngay gốc repo. Test CLI và lệnh soak là kiểm tra có thể lặp lại, thay vì dựa vào lời xác nhận của người triển khai. Benchmark dùng một cảnh chuẩn và chạy qua cùng renderer với game. Log ghi rõ GPU và cấu hình để không nhầm phép đo phần mềm với phép đo phần cứng.

Ước tính theo phạm vi công việc, không lấy từ bộ đếm của nhà cung cấp: khoảng 12.000 token cho Phase 1, 20.000 cho Phase 2, 14.000 cho Phase 3 và 15.000 cho Phase 4, tổng lượt chính khoảng 61.000 token. Ước tính chưa cộng đầy đủ các lượt sửa hình ảnh, điều khiển và địa hình giữa các phase. Không có số chi phí API thực tế.

Nếu làm lại, sẽ lấy đủ bảng thông số trước khi triển khai Phase 2, chụp ảnh một cảnh cố định sau mỗi thay đổi lớn về renderer, và chuẩn bị benchmark từ lúc chọn WebGL. Sẽ ghi rõ quyền commit, tag và phát hành ngay từ đầu.
