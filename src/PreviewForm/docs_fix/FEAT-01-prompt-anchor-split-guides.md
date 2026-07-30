# Prompt Gemini — FEAT-01: Toggle hiển thị Anchor & Split (guide overlay)

> **Không phải bug** — tính năng hỗ trợ Developer thiết kế view theo skill `fbo-design-view-field`.  
> Copy khối **Prompt** cho Gemini (`@src/PreviewForm`).

---

## Prompt

```
Thêm tính năng Preview Form: 2 nút bật/tắt hiển thị vị trí **anchor** và **split** trên layout (thông tin chung + nội dung tab đang mở). Không phải fix lỗi layout.

### Định nghĩa (skill fbo-design-view-field / reference-view-layout)

1. **anchor** (1-based): chỉ số cột trong `columns` sẽ **co giãn** khi kéo rộng form.
   - Trên `<view id="Dir" anchor="N">` → áp cho **Thông tin chung** (general / master columns).
   - Trên `<category anchor="N">` → áp cho **tab** đó (dùng columns của category).
   - Overlay: **một kẻ dọc (sọc)** tại biên trái hoặc giữa cột anchor — để user thấy cột nào đang là anchor.

2. **split** (thường trên `<view split="N">`): cắt `columns` thành 2 cột cha.
   - Panel 1 = N cột đầu (trái); Panel 2 = phần còn lại (phải).
   - Overlay: **một kẻ dọc** đúng tại ranh giới giữa cột N và N+1 (sau cột thứ split).
   - Category có `split` riêng thì dùng split của tab đó; không thì kế thừa `view.split`.

### UX nút bật/tắt

Toolbar cố định trên đầu Preview (sticky top):

| Nút | Hành vi |
|-----|---------|
| **Anchor** | Toggle `show_anchor` — bật thì vẽ sọc anchor trên general + tab active |
| **Split** | Toggle `show_split` — bật thì vẽ sọc split trên general + tab active |

- Hai nút độc lập (bật cả hai cùng lúc được).
- Trạng thái active: nút highlight / pressed.
- Tooltip ngắn:
  - Anchor: `Hiện cột co giãn (anchor=N)`
  - Split: `Hiện ranh giới panel trái/phải (split=N)`
- Nếu zone không có `anchor` / `split` (null): bật nút vẫn OK nhưng **không vẽ** sọc ở zone đó (hoặc hiện badge nhỏ “không khai báo”).

### Màu (khác nhau, dễ phân biệt trên dark theme)

| Loại | Gợi ý màu | CSS |
|------|-----------|-----|
| **Anchor** | Cam / amber | `rgba(255, 165, 0, 0.85)` hoặc `#f5a623` |
| **Split** | Xanh cyan / teal | `rgba(0, 200, 200, 0.9)` hoặc `#00bcd4` |

Sọc: width ~2px, `pointer-events: none`, `z-index` cao hơn field nhưng không chặn click. Có thể thêm nhãn nhỏ cạnh sọc: `A:6` / `S:7`.

### Cách tính vị trí sọc (px)

Với `column_widths = [w0, w1, …]` (đã render, kể cả pad label nếu có — **ưu tiên dùng cùng mảng px đang vẽ grid**):

```
// split=N (N cột trái, 1-based count) → sọc sau cột index N-1
split_x = sum(column_widths[0 .. N-1])

// anchor=A (1-based) → sọc tại mép trái cột anchor (hoặc giữa cột)
anchor_x = sum(column_widths[0 .. A-2])   // mép trái cột A
// optional: anchor_x += column_widths[A-1] / 2  // giữa cột
```

- **General:** dùng `view.master_columns` (+ pad nếu FormRow đang pad), `view.anchor`, `view.split`.
- **Tab active:** dùng `category.columns` (fallback master), `category.anchor ?? view.anchor`, `category.split ?? view.split`.
- **Footer (-1):** MVP **không vẽ** overlay trên footer — footer thường chỉ vài trường tổng, overlay không mang lại giá trị thiết kế.

### Guard & Edge cases

1. **anchor/split ngoài phạm vi columns:** Nếu `anchor > columns.length` hoặc `split > columns.length` → **không vẽ** sọc cho zone đó (tránh tính `left` sai hoặc vượt ra ngoài grid).
2. **Sọc split trên panel đã split:** Khi form đã chia thành 2 panel (`panel-left` + `panel-right`) bởi `split`, sọc split nên vẽ tại **biên phải** của `.panel-left` (hoặc biên trái `.panel-right`). Không tính đơn thuần `sum(widths[0..N-1])` trên container cha vì có thể có gap/margin giữa 2 panel.
3. **Sọc anchor trên panel đã split:** Khi `anchor ≤ split` → anchor nằm trong `panel-left`, tính `left` bình thường theo `leftWidths`. Khi `anchor > split` → anchor nằm trong `panel-right`, cần offset thêm chiều rộng `panel-left` + khoảng gap giữa 2 panel.
4. **Category có columns riêng (khác master):** Anchor/split fallback từ view vẫn áp dụng, nhưng nếu category columns ít hơn → kiểm tra guard ở mục 1.
5. **MVP tính vị trí theo fixed px:** Cột anchor hiện render `1fr` khi form rộng hơn tổng px → vị trí sọc anchor chỉ chính xác ở chế độ fixed. Chấp nhận sai lệch nhỏ khi webview giãn rộng — ghi chú trong code.

Vẽ sọc **relative** trong container row/panel (position absolute theo chiều cao toàn section general hoặc toàn tab body), không chỉ 1 dòng field — kẻ xuyên suốt chiều cao khối đó để dễ nhìn.

Gợi ý DOM:
```html
<div class="layout-guide-layer">
  <div class="guide-line guide-anchor" style="left: …px" title="anchor=6"></div>
  <div class="guide-line guide-split" style="left: …px" title="split=7"></div>
</div>
```
Parent: `position: relative` trên `.general-section` và `.fbo-tab-panel` (active).

### State (Preact)

```js
show_anchor: false  // default tắt
show_split: false
```

Toolbar buttons gọi `setState`. Không cần persist (MVP); optional `localStorage` sau.

### Files gợi ý

- `media/src/main.js` — toolbar + overlay components
- `media/src/previewForm.css` — `.guide-line`, `.guide-anchor`, `.guide-split`, toolbar
- Rebuild: `npm run build:preview-form`

### Không làm

- Không đổi logic parse/zone/width field.
- Không giả lập kéo resize form (chỉ **hiển thị** vị trí).
- Không bắt buộc giống pixel FBO WinForms — chỉ guide rõ ràng.
- Không vẽ overlay trên Footer (category `-1`).

### Mockup minh họa (TNTran: anchor=6, split=7, 13 cột master)

```
┌──────────────────── Preview Form ─────────────────────────┐
│ [⚓ Anchor]  [✂ Split]                    toolbar sticky  │
├───────────────────────────────────────────────────────────┤
│          THÔNG TIN CHUNG (general)                        │
│                                                           │
│  col1  col2  col3  col4  col5 ┃col6  col7│ col8 … col13  │
│                               ┃  A:6     │                │
│                               ┃  (cam)   │ S:7 (cyan)    │
│                               ┃          │                │
├───────────────────────────────────────────────────────────┤
│  [Tab 1] [Tab 2] [Tab 3]                                  │
│  ─── nội dung tab active ───                              │
│  (sọc anchor/split theo columns của category hoặc master) │
├───────────────────────────────────────────────────────────┤
│  ─── Footer (không vẽ overlay) ───                        │
└───────────────────────────────────────────────────────────┘

Chú thích:  ┃ = sọc Anchor (cam)    │ = sọc Split (cyan)
```

### Done

- [ ] Có 2 nút Anchor / Split trên Preview toolbar.
- [ ] Bật Anchor → sọc màu cam trên general + tab đang chọn, đúng cột `anchor`.
- [ ] Bật Split → sọc màu cyan tại biên panel trái|phải đúng `split`.
- [ ] Tắt nút → hết sọc.
- [ ] Hai màu khác nhau; TNTran (`anchor="6"` `split="7"`) dễ nhận biết.
- [ ] Guard: anchor/split ngoài phạm vi columns → không vẽ.
- [ ] Footer: không vẽ overlay.
```

---

## Ghi chú nội bộ

| Thuộc tính | Ý nghĩa nhanh |
|------------|----------------|
| `anchor="6"` | Cột thứ 6 (1-based) giãn khi kéo form |
| `split="7"` | 7 cột đầu = panel trái; còn lại = panel phải |

Mục đích: Developer nhìn Preview biết đang neo / cắt panel ở đâu khi chỉnh XML.
