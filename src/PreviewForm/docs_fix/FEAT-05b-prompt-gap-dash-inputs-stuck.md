# Prompt Gemini — FEAT-05b: Input vẫn dính — debug gap `-` + tách visual

Copy khối **Prompt** cho Gemini. Đọc kèm code hiện tại `@src/PreviewForm/media/src/main.js`, `previewForm.css`.  
Ảnh: sau FEAT-05 HTML đã hết lộ `<span>`, nhưng **các ô input vẫn dính sát** (CTNTran tab 19).

---

## Prompt

```
Preview Form CTNTran category 19 — input vẫn dính nhau. Cần **khảo sát + fix**, không đoán bừa.

═══════════════════════════════════════
### 0) Hiểu đúng pattern (quan trọng)
═══════════════════════════════════════

```xml
<category index="19" columns="100,100,30,100,100,30,100,100,30,100,30,100,100,0,0" …>
<item value="11-11-11-1-11--: [con_in_mm_ngang], [con_in_mm_doc], [vung_in_mm_ngang], …"/>
```

Pattern `11-11-11-1-11--` (15 cột):

| Vị trí | Char | Width | Ý nghĩa |
|--------|------|-------|---------|
| 0–1 | `11` | 100+100 | Ngang + Dóc **cạnh nhau** (XML **không** có `-` giữa chúng) |
| 2 | `-` | **30** | Gap **giữa nhóm** |
| 3–4 | `11` | 100+100 | nhóm tiếp |
| 5 | `-` | **30** | Gap giữa nhóm |
| … | | | |

→ Dấu `-` **không** tách Ngang|Dóc trong cùng nhóm.  
→ Gap thật = cột **30px** giữa các nhóm (sau mỗi cặp / sau `so_con_in`).

Nếu Preview mất cả khoảng **giữa nhóm** → bug empty/track.  
Nếu chỉ “dính” trong cặp Ngang|Dóc → đúng XML `11`, nhưng web vẫn có khe nhỏ vì ô input không full-bleed 100% cột (ExtJS padding) — Preview `vscode-text-field { width:100% }` làm 2 cột 100px **dính biên**.

Làm **cả hai hướng** dưới đây (debug trước, rồi fix).

═══════════════════════════════════════
### 1) Debug bắt buộc (trước khi kết luận)
═══════════════════════════════════════

Tạm thêm (xong xóa hoặc `#ifdef` comment):

```css
.form-cell-empty {
  outline: 1px solid red; /* thấy gap */
  background: rgba(255,0,0,0.15);
}
```

Mở Preview CTNTran tab kích thước con in:

- [ ] Có dải đỏ ~30px giữa nhóm “Kích thước con in” và “Kích thước vùng in”?
- [ ] Có dải đỏ giữa các nhóm khác (cột index 2,5,8,10)?

**Case A — Không thấy dải đỏ:** empty/`-` **không chiếm chỗ** → fix mục 2.  
**Case B — Có dải đỏ giữa nhóm, nhưng Ngang|Dóc trong nhóm vẫn dính:** đúng pattern `11` + full-bleed control → fix mục 3 (gutter visual).

Log nhanh (optional): `row.cells` filter empty → `start_col` + `column_widths[start_col]` phải là 30 tại 2,5,8,10.

═══════════════════════════════════════
### 2) Fix gap `-` không hiện (Case A)
═══════════════════════════════════════

Nghi phạm hiện tại:
- `.form-cell-empty { min-width: 0 }` — dễ bị co khi grid/item tranh chỗ.
- `vscode-text-field` min-content có thể làm track lệch.
- Empty chỉ `width:100%` nhưng track thực tế không còn 30px.

Fix:
1. Khi render empty, **ép kích thước từ columns**:
```js
const gap_px = Number(targetWidths[c.start_col]) || 0;
html`<div class="form-cell-empty"
  style="grid-column: ${c.start_col+1} / span 1; width:${gap_px}px; min-width:${gap_px}px; max-width:${gap_px}px;"></div>`
```
(Truyền `targetWidths` = `column_widths` panel đang render — leftWidths/rightWidths đã shift.)

2. CSS:
```css
.form-cell-empty {
  box-sizing: border-box;
  flex-shrink: 0;
  /* bỏ min-width: 0 nếu đang cho phép co về 0 */
}
```

3. `grid-template-columns`: cột gap vẫn `minmax(30px, 30px)` (hoặc `${w}px`), **không** gộp/bỏ cột `-`.

4. Control cell: giữ `min-width: 0; overflow: hidden` để **không** tràn đè lên cột gap.

5. Sau fix: outline đỏ ~30px hiện giữa nhóm; rồi bỏ outline debug.

═══════════════════════════════════════
### 3) Fix Ngang|Dóc dính biên trong cặp `11` (Case B / luôn làm nhẹ)
═══════════════════════════════════════

XML `11` = hai cột kề. Web vẫn thấy khe vì control không sát mép cell.

Preview: `vscode-text-field { width:100% }` → hai ô 100px chung một đường biên = “dính”.

Fix fidelity UI (không đổi columns/parser):
```css
.form-cell:not(.form-cell--label):not(.form-cell-empty) {
  padding-right: 4px; /* hoặc 2–6px — khớp cảm giác web */
  box-sizing: border-box;
}
.form-cell-empty {
  padding: 0; /* gap cột giữ đúng px XML */
}
```

Hoặc chỉ `gap` không được — CSS grid `column-gap` sẽ **cộng thêm** ngoài columns → lệch tổng px → **cấm** `column-gap` trên `.form-row`.

═══════════════════════════════════════
### 4) Không làm
═══════════════════════════════════════

- Không đổi CTNTran.xml / không tự chèn `-` giữa mọi `11`.
- Không `column-gap` trên grid làm lệch tổng width.
- Không phá FEAT-05 HTML Description/Label.

### Done
- [ ] Debug outline: xác nhận Case A hoặc B (ghi trong comment PR)
- [ ] Giữa các nhóm có khoảng ~30px (cột `-`)
- [ ] Trong cặp Ngang|Dóc: có khe nhỏ do padding cell (không dính một khối)
- [ ] Rebuild bundle, bỏ outline đỏ
```

---

## Gợi ý trả lời Gemini nếu họ hỏi

| Câu Gemini | Trả lời |
|------------|---------|
| Có cần `-` giữa Ngang và Dóc không? | **Không** — XML là `11`; gap là `-` **30px giữa nhóm** |
| Sao web vẫn thấy tách trong cặp? | Padding/control không full-bleed; Preview đang width 100% sát mép |
| Fix bằng `column-gap`? | **Không** — lệch tổng columns |
