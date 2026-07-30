# Prompt Gemini — FIX-14: Footer lệch giữa + label «Ghi chú công việc» hẹp hơn XML

Copy khối **Prompt** cho Gemini (`@src/PreviewForm`). Skill tham chiếu: `fbo-design-view-field` (pattern `1`/`0`/`-`, columns px).

---

## Prompt

```
Fix Preview Form — 2 lỗi fidelity layout (TNTran). Không đổi docs gốc.

═══════════════════════════════════════
### 1) Footer đang nằm CHÍNH GIỮA — sai
═══════════════════════════════════════

XML:
```xml
<category index="-1" columns="100, 100, 100, 37, 200, 8, 58, 42, 8, 100, 0" anchor="5">
<item value="------10-11: [t_so_luong].Label, [t_so_luong],[da_tt_nt]"/>
<item value="------10-11: [t_tien_nt2].Label, [t_tien_nt2], [t_tien2]"/>
```

Theo skill fbo-design-view-field:
- Pattern `------10-11` (11 ký tự) = 11 cột khớp `columns`.
- Sáu ký tự `-` đầu = **khoảng trống thật** (giữ width px), đẩy label/input về **phía cuối / bên phải** form — không phải căn giữa khối content.
- `1` = ô label/input; `0` sau `1` = span/giãn theo columns.

Map cột (0-based):

| Col | Pat | Width px | Ý nghĩa |
|-----|-----|----------|---------|
| 0–5 | `-` | 100+100+100+37+200+8 | Gap trái (phải chiếm chỗ) |
| 6 | `1` | 58 | Label (span thêm col 7 nếu `10`) |
| 7 | `0` | 42 | Span của label |
| 8 | `-` | 8 | Gap nhỏ |
| 9 | `1` | 100 | Input chính |
| 10 | `1` | 0 | Ẩn / cột 0 |

**Sai hiện tại:** Khối label+input nằm giữa màn hình (như bị center), bên trái/phải trống đều — nghĩa là các cột `-` **không giữ width**, hoặc row bị `fit-content` + căn giữa, hoặc empty cell không tham gia grid.

**Fix bắt buộc:**
1. Footer: `split={null}` — không dùng `view.split`.
2. Mỗi footer row = **một** CSS grid với `grid-template-columns` đúng 11 giá trị px từ category `-1` (cột `0` → `0px`).
3. Render đủ cell `empty` cho mọi `-` (đã có `start_col`); empty phải **chiếm đúng width cột** trong grid (không collapse).
4. Chiều rộng row footer = **tổng px columns** (≈ 753) hoặc full width form master cùng tổng — **không** `width: fit-content` + `margin: 0 auto` làm khối nhỏ nằm giữa.
5. `anchor="5"` (1-based): khi form rộng hơn tổng px, cột thứ 5 trong `columns` co giãn (`1fr` hoặc flex) — giữ vị trí tương đối FBO; MVP tối thiểu: đúng fixed px đã đủ đẩy content về phải.
6. Xóa text tĩnh «Loading Preview Form...» nếu còn sót góc dưới.

**Done 1:** Label «Số lượng linh kiện» / «Tiền linh kiện» nằm **gần cuối (phải)** theo `------` + columns, không chính giữa webview; label sát input theo `10-11`.

═══════════════════════════════════════
### 2) «Ghi chú công việc» bị che — preview hẹp hơn width XML
═══════════════════════════════════════

Dòng general:
`110000000000: [ghi_chu_cv].Label, [ghi_chu_cv]`
Master columns TNTran bắt đầu `100, 110, ...` → cột label ≈ **100px** (đúng XML).

Form web với cùng khai báo hiện đủ (hoặc chỉ clip đúng theo 100px). Preview đang clip sớm hơn → **ô label preview thực tế hẹp hơn 100px** (padding/border toolkit, `box-sizing`, `min-width:0`, co cột, font khác…).

**Fix:**
1. Label: `white-space: nowrap`; vượt width cột → `overflow: hidden` **clip** (che) — **không wrap** 2 dòng.
2. Đảm bảo cột label nhận **đủ đúng px XML** (vd 100px nội dung hữu dụng):
   - `box-sizing: border-box` nhất quán trên cell.
   - Tránh padding/margin trên `.form-cell--label` / `.field-label` làm mất bề ngang chữ.
   - Không để parent `overflow` + shrink làm cột < giá trị `column_widths`.
3. Nếu sau khi khớp box-model vẫn thiếu vài px so web (font VS Code vs FBO): cho phép **cộng đệm nhỏ có kiểm soát** (vd +4~8px chỉ cho đo label, hoặc giảm padding) để **cùng một XML** nhìn gần như web — ghi chú trong code vì sao. Không tự đổi số trong parser/`columns` XML.
4. So sánh: «Ghi chú công việc» / «Phân loại giao dịch» không bị cắt sớm hơn form web.

**Done 2:** Cùng XML, Preview không che sớm hơn web; không wrap label.

═══════════════════════════════════════
### Files
═══════════════════════════════════════
- `media/src/main.js` — footer FormRow/CategoryPanel; empty cells; width row
- `media/src/previewForm.css` — footer grid, label cell box model
- Rebuild bundle

### Không làm
- Không center footer bằng flex/grid place-content: center.
- Không bỏ leading `------` (đó là chỗ đẩy sang phải).
- Không đổi zone categoryIndex.
```

---

## Ghi chú nhanh

| Hiện tượng | Root cause |
|------------|------------|
| Footer giữa màn | Gap `-` không giữ px / row shrink + center |
| Đúng FBO | `------` = spacer trái theo columns → content gần cuối |
| Label bị che sớm | Cell preview < px XML (box model) |
