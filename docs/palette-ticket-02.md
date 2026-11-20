# Bảng màu Ticket-02

Bảng RGB được bổ sung sau khi các tag dựng lại đã được tạo. Bản làm việc áp dụng bảng màu nhận được vào Canvas và Three.js. Xem các mã gốc trong `src/palette.mjs` và màu chữ, cảnh báo, điểm trong `style.css`.

Các mã dùng làm màu cơ sở. Pixel trong cảnh có thể sáng hoặc tối hơn do ánh sáng, bóng đổ, sương và hiệu ứng nhấp nháy. Ánh sáng môi trường Three.js và hệ số màu đất Canvas dùng `0.15 + 0.55 × (đèn sáng / tổng đèn)`.

Bảng số liệu gameplay ở Phần 1 cũng đã được bổ sung sau đó. Bản làm việc áp dụng các hằng số mới và giữ luật bình minh của Ticket-03. Bốn tag local đã được đồng bộ. Báo cáo benchmark và soak được đo lại trên bản cập nhật.
