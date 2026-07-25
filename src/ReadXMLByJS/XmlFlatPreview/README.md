# XML Flat Preview

Tính năng **XML Flat Preview** cho phép xem trước toàn bộ file XML FastBusiness FBO sau khi đã phân giải tất cả thực thể (entities), hỗ trợ hiển thị tooltip thông tin chi tiết thực thể và định dạng XML trực quan.

## Tính năng

1. **Phân giải phẳng (Flat Entity Expansion)**: Mở rộng tất cả `&EntityName;` thành nội dung thực tế (cả thực thể nội bộ và liên kết ngoài SYSTEM).
2. **Tô màu thực thể**: Mỗi thực thể được tô một màu sắc deterministic ổn định và duy nhất.
3. **Cảnh báo lỗi**: Phát hiện và báo cáo các thực thể bị thiếu (`MISSING_ENTITY`), lỗi độ sâu tối đa (`DEPTH_LIMIT_EXCEEDED`) hoặc vòng lặp vô hạn (`CIRCULAR_ENTITY`).
4. **Excel-like Tooltip Card**: Di chuột hoặc click vào vùng thực thể được phân giải để hiển thị tooltip ghi tên thực thể, loại (internal/external), độ dài, file khai báo, và danh sách các thực thể con lồng nhau.
5. **Đồng bộ hóa & Tự động lưu**: Hỗ trợ lưu file nguồn trước khi preview. Panel tự động cập nhật khi file nguồn hoặc các file DTD liên kết được lưu.
6. **Thanh Toolbar hiện đại**:
   - **Refresh**: Cập nhật lại nội dung.
   - **Copy Flat**: Sao chép nội dung XML phẳng.
   - **Copy Original**: Sao chép XML gốc.
   - **Cấu hình**:
     - *Phân giải trong CDATA*: Toggle việc phân giải thực thể bên trong thẻ CDATA.
     - *Định dạng XML (Format)*: Định dạng lại thụt lề XML.
     - *Tự động xuống dòng (Wrap)*: Toggle Word Wrap.
     - *Hiện số dòng*: Toggle Line Numbers.
     - *Tô màu thực thể*: Bật/tắt tô nền thực thể.
   - **Tìm kiếm**: Tìm kiếm văn bản, highlight kết quả và di chuyển nhanh giữa các kết quả bằng Enter/Shift+Enter hoặc các phím mũi tên.
7. **Legend Sidebar**: Danh sách các thực thể đã phân giải kèm số lượng. Click vào item để tự động di chuyển màn hình đến vị trí đầu tiên xuất hiện.

## Phím tắt & Thao tác nhanh

- **R**: Refresh panel (khi focus vào Webview).
- **Ctrl + F**: Focus vào ô tìm kiếm.
- **Esc**: Đóng hoặc bỏ ghim tooltip card.
- **Click vào thực thể**: Ghim (Pin) tooltip card để thực hiện các thao tác phụ như *Copy nội dung* hoặc *Đi đến khai báo*.
