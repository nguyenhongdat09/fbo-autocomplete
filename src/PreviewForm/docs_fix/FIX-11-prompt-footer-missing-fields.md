# FIX-11 — Cập nhật (user xác nhận)

## Bug A (Địa chỉ / Người thực hiện) — **KHÔNG phải bug Preview**

User xác nhận: `nguoi_th` có `categoryIndex="6"` mà khai chung một `<item>` với field không có `categoryIndex` → **không hiện ở general là đúng**.

Đây là tín hiệu design fidelity: Developer thấy sai khai báo → sửa XML (tách row / bỏ categoryIndex / đưa đúng tab).

**Gemini: đừng đổi zone rule theo hướng “mix null + 6 → general”.** Giữ hành vi hiện tại (row theo first non-null `category_index`).

## Bug B / C

Footer xa + Loading sót — vẫn làm nếu chưa xong (xem prompt cũ bên dưới đã gạch Bug A).

---

## Prompt (đã chỉnh — chỉ còn footer / loading)

```
Fix Preview Form — chỉ Bug footer + loading. KHÔNG đổi zone categoryIndex.

### KHÔNG làm
Không sửa rule zone để kéo row mix (field có categoryIndex + field null) về general.
Ví dụ nguoi_th categoryIndex=6 chung item với dia_chi → không hiện general là ĐÚNG (lỗi XML của developer).

### Bug footer — label / input cách xa
Footer rows_by_category["-1"] đang nhận split={view.split} → space-between kéo label/input ra 2 mép.
Fix: footer KHÔNG dùng view.split; một CSS grid theo column_widths của category -1; có thể margin-left:auto cả khối footer về phải.
Files: media/src/main.js, previewForm.css. Rebuild bundle.

### Loading sót
Xóa text "Loading Preview Form…" tĩnh sót ngoài Preact root sau khi đã có model.

### Done
Footer «Số lượng linh kiện» / «Tiền linh kiện» gần input; không đổi hành vi zone mix categoryIndex.
```
