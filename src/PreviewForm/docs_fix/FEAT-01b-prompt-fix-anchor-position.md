# Prompt Gemini — FEAT-01b: Sọc Anchor sai vị trí (TNTran anchor=6)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`).

---

## Prompt

```
Fix sọc Anchor trên Preview Form — đang kẻ SAI vị trí.

### XML / kỳ vọng (TNTran)

```xml
<view id="Dir" height="254" anchor="6" split="7">
<item value="100, 110, 100, 90, 30, 147, 8, 58, 42, 8, 100, 0, 0, 0, 0"/>
<item value="111000-100111111: [dept_id].Label, [dept_id], [ten_bp%l], ..."/>
```

Master columns (1-based):

| Cột | Width | Pattern đầu dòng |
|-----|-------|------------------|
| 1 | 100 | `1` Label Cửa hàng |
| 2 | 110 | `1` dept_id |
| 3 | 100 | `1` ten_bp bắt đầu |
| 4 | 90 | `0` ten_bp span |
| 5 | 30 | `0` ten_bp span |
| **6** | **147** | `0` ten_bp span **← đây là cột anchor** |
| 7 | 8 | `-` |
| 8+ | … | panel phải (sau split=7) |

Pattern prefix `111000` = cột 1→6. **Cuối `111000` = cuối ô ten_bp%l = mép phải cột 6 (width 147).**

User: sọc Anchor phải kẻ **đúng mép phải cột anchor (cột 6 / 147px)** = cuối ten_bp — KHÔNG kẻ lệch sang khoảng trống giữa 2 panel.

### Bug code hiện tại (`CategoryPanel` trong main.js)

```js
// Đang dùng MÉP TRÁI cột anchor:
const anchor_x = rendered_widths.slice(0, anchor - 1).reduce(...)
// → left edge cột 6 = sau cột 1..5, NẰM GIỮA vùng span ten_bp / trông như lệch phải so với ô input nhìn thấy
```

Nhánh `anchor > split` dùng `style.right = sum(slice(anchor-1))` cũng sai hệ tọa độ.

### Fix bắt buộc

1. **Vị trí sọc Anchor** = **mép phải** cột `anchor` (1-based):

```js
// anchor = 6 → sum widths[0..5] (6 phần tử đầu)
const anchor_x = rendered_widths.slice(0, anchor).reduce((a, b) => a + b, 0);
// style={{ left: anchor_x + 'px' }}
```

TNTran check:  
`100+110+100+90+30+147 = 577` (+ pad label cột 1 nếu có LABEL_COL_PAD_PX).  
Sọc phải sát **cuối** ô `ten_bp`, không nằm giữa khoảng trống tới “Ngày lập”.

2. **Cùng hệ tọa độ với panel trái** khi `split` có và `anchor <= split`:
   - Layer guide gắn / canh theo **cùng origin với `.panel-left`** (hoặc toàn `category-panel` nhưng `left` chỉ = tổng px cột từ đầu panel trái — đúng 577px).
   - Không dùng `%` chiều rộng full webview.
   - Không cộng thêm gap `space-between` giữa 2 panel vào `anchor_x`.

3. Khi `anchor > split` (anchor nằm panel phải):
```js
const left_w = rendered_widths.slice(0, split).reduce((a,b)=>a+b,0);
const in_right = rendered_widths.slice(split, anchor).reduce((a,b)=>a+b,0);
// left = left_w + gap_between_panels + in_right
// gap: đo DOM (.panel-right.offsetLeft - panel_left right) hoặc tạm 0 nếu panel sát; tốt nhất query layout sau render
```
MVP: nếu khó đo gap, đặt guide layer **bên trong từng panel** thay vì một layer full width.

4. **Split sọc** giữ: `split_x = sum(rendered_widths.slice(0, split))` = mép phải cột `split` (biên 2 panel). Màu cyan khác anchor cam.

5. Rebuild bundle + Reload Window. Verify TNTran:
   - Bật Anchor → sọc cam `A:6` **sát cuối ten_bp** (cuối khối `111000`).
   - Bật Split → sọc cyan `S:7` tại biên panel trái/phải (sau cột 8px, trước Ngày lập).

### Không làm
- Không đổi nghĩa XML anchor/split.
- Không xóa nút toggle.
- Không quay lại `slice(0, anchor - 1)` cho mép trái trừ khi user đổi yêu cầu.

### Done
- [ ] anchor=6 ↔ cuối cột width 147 ↔ cuối ten_bp trên dòng Cửa hàng
- [ ] Không còn sọc cam lơ lửng giữa form
```

---

## Công thức nhanh (nhớ)

```
columns:  100, 110, 100, 90, 30, 147, 8, ...
index1:    1    2    3   4   5   6    7
pattern:   1    1    1   0   0   0    -
           └──────── 111000 = ten_bp hết ở đây ──┘
anchor="6" → sọc tại x = sum(col 1..6) = mép phải cột 6
```
