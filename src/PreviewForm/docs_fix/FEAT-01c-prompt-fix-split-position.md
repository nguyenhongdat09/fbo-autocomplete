# Prompt Gemini — FEAT-01c: Sọc Split sai vị trí (phải ở đầu Ngày LCT)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`).

---

## Prompt

```
Fix sọc Split trên Preview Form — đang kẻ giữa khoảng trống; phải kẻ ở ĐẦU panel phải (= đầu «Ngày lập» / cột width 58).

### XML / kỳ vọng (TNTran)

```xml
<view id="Dir" height="254" anchor="6" split="7">
<item value="100, 110, 100, 90, 30, 147, 8, 58, 42, 8, 100, 0, 0, 0, 0"/>
```

`split="7"` cắt columns thành 2 phần:

| Panel | Columns (px) |
|-------|----------------|
| **Trái** (7 cột) | `100, 110, 100, 90, 30, 147, 8` |
| **Phải** (còn lại) | `58, 42, 8, 100, 0, 0, 0, 0` |

Dòng ví dụ:
`11000--10011: [loai_sc].Label, [loai_sc], [&Revert.Field.1;].Label, [&Revert.Field.1;], [ngay_lct]`
→ `[ngay_lct]` / label phía phải nằm ở **panel phải**, bắt đầu từ cột đầu panel phải = **width 58**.

User: sọc Split (`S:7`) phải kẻ đúng **đầu Ngày LCT** = **mép trái panel phải** = đầu dải `58, 42, 8, ...` — KHÔNG kẻ lơ lửng giữa gutter trống (do `justify-content: space-between`).

### Bug hiện tại

Code kiểu:
```js
split_x = sum(rendered_widths.slice(0, split)); // = mép phải panel TRÁI
style={{ left: split_x + 'px' }} // trên category-panel full width
```

FormRow dùng `display:flex; justify-content:space-between` → giữa `.panel-left` và `.panel-right` có **khoảng trống flex**.  
`left = sum(7 cột)` chỉ là hết panel trái; panel phải bị đẩy sát mép phải webview → «Ngày lập» nằm xa hơn → sọc cyan trông như giữa khoảng trống, không sát Ngày LCT.

### Fix bắt buộc

1. **Vị trí sọc Split = mép trái `.panel-right`** (đầu nội dung panel phải / đầu cột 58), không phải mép phải `.panel-left` nếu hai panel bị space-between tách xa.

2. Cách implement (chọn một, ưu tiên A):

**A — Đo DOM (chính xác với space-between):**
- Sau render, trong `category-panel` (general / tab): query `.panel-left` và `.panel-right` (dòng đầu có split).
- `split_x = panel_right.offsetLeft - category_panel.offsetLeft` (hoặc `getBoundingClientRect` delta).
- Đặt sọc `left: split_x`.
- Cập nhật lại khi resize / đổi tab / bật nút Split (useEffect / requestAnimationFrame).

**B — Đổi layout guide:**
- Gắn sọc Split **bên trong** `.panel-right` với `left: 0` (luôn đầu panel phải).
- Hoặc bỏ `space-between` gap khi đang show guide (không khuyến nghị đổi layout form).

**C — Không dùng space-between cho khoảng cách 2 panel:**  
Giữ panel trái cố định; panel phải `margin-left: auto` nhưng guide vẫn phải đo `offsetLeft` của panel-right (giống A).

3. **Công thức logic (đối chiếu XML, không phụ thuộc %):**
```
left_widths  = columns.slice(0, split)     // 7 phần tử
right_widths = columns.slice(split)      // bắt đầu 58
// Sọc = điểm bắt đầu right_widths trên màn hình = đầu Ngày LCT
```

4. Nhãn `S:7` giữ màu cyan; Anchor cam không đổi (FEAT-01b: mép phải cột anchor).

5. Rebuild `npm run build:preview-form`, Reload Window, TNTran:
   - Bật **Split** → sọc cyan **sát trái** khối Ngày lập / số chứng từ (đầu width 58).
   - Không còn nằm giữa khoảng trống.

### Không làm
- Không đổi `split="7"` semantics (vẫn 7 cột trái).
- Không kẻ ở giữa gutter flex.
- Không dùng `left: sum(left_widths)` trên container full-width nếu vẫn space-between (sai visual).

### Done
- [ ] `S:7` trùng đầu «Ngày lập» / đầu panel phải
- [ ] Đối chiếu pattern: Revert/ngay_lct ở dải `58,42,...`
```

---

## Nhắc nhanh

```
100, 110, 100, 90, 30, 147, 8  |  58, 42, 8, 100, 0, 0, 0, 0
         panel trái (split=7)   |  panel phải ← sọc Split ở ĐÂY (đầu 58)
                                ↑
                         đầu Ngày LCT
```
