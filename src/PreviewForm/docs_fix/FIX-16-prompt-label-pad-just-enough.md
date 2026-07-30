# Prompt Gemini — FIX-16: Label «Ghi chú công việc» vừa đủ như form web

Copy khối **Prompt** dưới cho Gemini (`@src/PreviewForm`).

Tham chiếu ảnh:
- **Ảnh 1 (Preview hiện tại):** label/cột đã rộng hơn cần thiết sau `LABEL_COL_PAD_PX`.
- **Ảnh 2 (Form web FBO):** label «Ghi chú công việc» **vừa đủ** — hết chữ, khe nhỏ (~10–15px) tới input, không dư ngang.

---

## Prompt

```
Fix Preview Form — chỉnh độ rộng cột label cho «Ghi chú công việc» / «Phân loại giao dịch» VỪA ĐỦ như form FBO web (ảnh 2), không rộng thừa như preview hiện tại.

### Mục tiêu visual
- Label 1 dòng, hiện đủ chữ (không cắt «Ghi chú công việ», không cắt «Phân loại giao dị»).
- Sau chữ dài nhất chỉ còn khe nhỏ tới ô input — giống ảnh 2, không khoảng trống label rộng.
- Không wrap 2 dòng.

### Code hiện tại (nghi phạm “hơi rộng”)
File `src/PreviewForm/media/src/main.js`:
```js
const LABEL_COL_PAD_PX = 14; // đang cộng thêm vào mọi cột có role=label
```
Pad này bù font webview nhưng đang làm label column rộng hơn form web.

### Cách làm (chọn 1, ưu tiên A)
**A — Giảm pad (nhanh):**
- Hạ `LABEL_COL_PAD_PX` xuống khoảng **6–8** (thử 8 trước; nếu còn cắt chữ dài → 10; nếu vẫn rộng thừa → 6).
- Giữ `minmax(W+pad, W+pad)` chỉ cho cột label; không pad cột input.
- Giữ `font-size: 11px` (hoặc tinh chỉnh 11–12px) trên `.field-label` trong `previewForm.css`.

**B — Nếu vẫn lệch so web:**
- Đo: cùng XML cột label = 100px master; form web vừa «Ghi chú công việc».
- Chỉ pad cột label, không scale toàn form.
- Không đổi số trong XML / parser columns.

### Không làm
- Không tăng pad trở lại 14/18.
- Không `white-space: normal` (wrap).
- Không phá split / footer / path guard.

### Files
- `src/PreviewForm/media/src/main.js` — `LABEL_COL_PAD_PX`
- `src/PreviewForm/media/src/previewForm.css` — `.field-label` nếu cần
- `npm run build:preview-form` rồi bảo user Reload Window

### Done
- [ ] «Ghi chú công việc» đủ chữ, khe tới input nhỏ như ảnh 2
- [ ] «Phân loại giao dịch» đủ chữ, không dư rộng
- [ ] Các label ngắn (Cửa hàng, Mã khách…) không bị đẩy input sang phải quá xa
```

---

## Gợi ý giá trị

| Pad | Ý nghĩa |
|-----|---------|
| 18 | Quá rộng (đã bỏ) |
| 14 | Hơi rộng (hiện tại) |
| **8** | Điểm thử đầu cho “vừa đủ” |
| 6 | Nếu 8 vẫn rộng |
| 10 | Nếu 8 còn cắt chữ dài |
