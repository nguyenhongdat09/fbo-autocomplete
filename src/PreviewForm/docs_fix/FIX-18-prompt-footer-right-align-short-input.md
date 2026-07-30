# Prompt Gemini — FIX-18: Footer TNTran lệch giữa + input dài (phải sát phải như form web)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src/main.js`, `previewForm.css`).

Tham chiếu: skill `fbo-design-view-field`; FIX-14 (đã từng fix nhưng **hồi/chưa đủ**).

---

## Prompt

```
Fix Preview Form footer layout — fidelity so với form FBO web (TNTran).

### Hiện tượng (ảnh user)

**Preview (sai):**
- «Số lượng linh kiện» / «Tiền linh kiện» nằm **giữa** bề ngang form.
- Ô input `t_so_luong` / `t_tien_nt2` **rộng bất thường** (kéo dài).
- Hai bên còn khoảng trống đều — trông như khối bị center.

**Form web (đúng):**
- Cùng 2 field nằm **sát mép phải / cuối form**.
- Input **ngắn** (~ đúng cột width 100 trong columns).
- Bên trái là khoảng trống lớn (do pattern `------`).

### XML nguồn (không đổi)

```xml
<category index="-1" columns="100, 100, 100, 37, 200, 8, 58, 42, 8, 100, 0" anchor="5">
…
<item value="------10-11: [t_so_luong].Label, [t_so_luong],[da_tt_nt]"/>
<item value="------10-11: [t_tien_nt2].Label, [t_tien_nt2], [t_tien2]"/>
```

Map cột (0-based) — bắt buộc hiểu đúng:

| Col | Pattern | Width | Vai trò |
|-----|---------|-------|---------|
| 0–5 | `-` | 100+100+100+37+200+8 | **Spacer trái** — phải chiếm đúng px (không collapse) |
| 6–7 | `10` | 58+42 | Label (span 2) |
| 8 | `-` | 8 | Gap nhỏ |
| 9 | `1` | **100** | Input chính — **không** được giãn thành ô dài |
| 10 | `1` | 0 | Ẩn |

`anchor="5"` (1-based) = cột width **200** (một trong các spacer `-`). Khi form/webview **rộng hơn** tổng ~753px, cột này nhận phần dư (`1fr`) → **đẩy** label+input về **mép phải**. Không được để phần dư đổ vào cột input 100.

### Root cause cần kiểm tra (ưu tiên theo thứ tự)

1. **Leading `-` không giữ chỗ**  
   Empty cell thiếu `start_col` / không render / CSS collapse → grid chỉ còn vài cột label+input → chúng bị `width:100%` giãn ra giữa form → input dài + trông “ở giữa”.

2. **`anchor` 1fr gán nhầm cột**  
   `minmax(W, 1fr)` phải ở cột index `anchor - 1` (= cột 200), **không** ở cột input 100. Sai → input dài.

3. **Row footer không full-width + không 1fr**  
   Row `fit-content` / shrink + `margin: auto` / `justify-content: center` → khối nhỏ nằm giữa (đúng triệu chứng FIX-14 cũ).

4. **Lỡ truyền `split={view.split}` lại vào footer**  
   `space-between` 2 panel → lệch/xa — footer chỉ `split={footer_category.split}` (TNTran = null).

5. **`column_widths` footer rỗng / sai**  
   Phải là đúng 11 số từ category `-1` (không rơi fallback master nếu category đã có columns).

### Fix bắt buộc

1. Footer `CategoryPanel`: `split={null}` (hoặc chỉ `footer_category.split` nếu XML có); `anchor={footer_category.anchor}` (=5).
2. Mỗi footer row = **một** CSS grid:
   - `width: 100%` (full bề ngang panel, không fit-content, không margin auto center).
   - `grid-template-columns` = 11 track từ `column_widths` (+ LABEL pad đúng cột label).
   - Cột `anchor` (index 4): `minmax(200px, 1fr)` (kèm pad nếu có).
   - Cột input (index 9): `minmax(100px, 100px)` — **cố định**, không `1fr`.
   - Cột width `0`: `0px`.
3. Render **đủ** 6 empty cell leading `------` với `grid-column-start` đúng `start_col+1`; empty phải tham gia track (không `display:none`).
4. `vscode-text-field` `width:100%` chỉ trong **cell** 100px — không làm vỡ track.
5. Không `place-content: center` / `justify-items: center` trên footer row/panel.

### Done (so ảnh web)

- [ ] «Số lượng linh kiện» / «Tiền linh kiện» **sát phải** form (không giữa).
- [ ] Input ngắn ≈ 100px columns — **không** kéo dài.
- [ ] Thu hẹp/phóng webview: phần dư vào cột anchor (spacer), content vẫn neo phải.
- [ ] General/tab không regress; guide Anchor footer vẫn đầu cột 5 (FEAT-01d/f).

### Files

- `media/src/main.js` — FormRow footer / getTemplateCols / empty cells
- `media/src/previewForm.css` — `.footer-section`, `.form-row`, `.form-cell-empty`
- Rebuild: `npm run build:preview-form`, Reload Window

### Không làm

- Không “căn phải” bằng `margin-left: auto` trên khối label+input mà bỏ spacer `-` (phá fidelity pattern).
- Không tăng width input trong XML/parser.
- Không dùng `view.split` cho footer.
```

---

## Nhắc nhanh

| | Preview sai | Web đúng |
|--|-------------|----------|
| Vị trí | Giữa form | Cuối / sát phải |
| Input | Dài | ~100px |
| Cơ chế | `------` giữ px + `anchor=5` giãn spacer | giống |
