# Prompt Gemini — FIX-19: `%l` / readOnly gạch dưới không full width cell (tab split)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm/media/src`).

Ví dụ: TNTran tab **4.1** (`category index="12"`).

---

## Prompt

```
Fix Preview Form: field lookup `%l` / readOnly (`.readonly-value`) — **gạch dưới chỉ dài bằng chữ**, không đầy ô grid theo `columns` + pattern `0` span. Check + fix CSS/layout; không đổi XML.

═══════════════════════════════════════
### A) Khảo sát XML (không phải lỗi khai báo split)
═══════════════════════════════════════

```xml
<category index="12" columns="150, 30, 70, 100, 157, 70, 8, 58, 42, 8, 100, 0, 0, 0" split="11">
<item value="11010000000: [ma_dv_vc].Label, [ma_dv_vc], [ten_dv%l]"/>
```

Map pattern `11010000000` (11 ký tự = đúng panel trái của `split="11"`):

| Pattern | Cột (0-based) | Width | Field |
|---------|---------------|-------|--------|
| `1` | 0 | 150 | Label |
| `10` | 1–2 | 30+70 | `ma_dv_vc` |
| `10000000` | 3–10 | 100+157+70+8+58+42+8+100 = **~543px** | `ten_dv%l` |

→ `ten_dv` **phải** chiếm ~543px (span các cột `0` sau `1`).  
`split="11"` chỉ cắt panel trái/phải — **không** phải lý do gạch ngắn bằng chữ `"ten_dv"`.

Category **không** có `anchor` → panel trái `flex: 0 0 auto` (FEAT-03): khi kéo rộng Preview, nửa form **không** tự giãn thêm. Muốn giãn hết bề ngang cần `anchor` trên cột nằm trong span của field (thiết kế XML) — **không** nhầm với bug gạch dưới.

═══════════════════════════════════════
### B) Bug Preview (phải fix)
═══════════════════════════════════════

Hiện tượng: `.readonly-value` border-bottom **shrink theo text** (~width chữ), trong khi cell grid đã (hoặc phải) rộng theo col_span.

Nguyên nhân khả dĩ:
1. `.form-cell` / `.readonly-value` không `stretch` full grid area (`align-items: center` trên panel grid làm item co theo content trên một trục; hoặc flex child không `align-self: stretch` / `width: 100%`).
2. `col_span` của `%l` (trailing `0`) bị mất khi split/`clamp_cell_to_panel` → chỉ còn 1 cột hẹp — **vẫn** phải dài hơn chữ; nếu span mất hẳn thì fix parser/UI span trước.
3. Bundle CSS cũ — rebuild sau khi sửa.

═══════════════════════════════════════
### C) Fix bắt buộc
═══════════════════════════════════════

1. **Verify** sau parse + split: cell `ten_dv%l` có `start_col === 3`, `col_span === 8` (hoặc tương đương đủ cột `0` còn lại trong panel trái).

2. **CSS** — gạch / nền value phải full bề ngang **cell**:
```css
.form-cell {
  /* grid item */
  justify-self: stretch;
  min-width: 0;
  width: auto; /* để stretch theo grid area, không fit-content */
}
.form-cell .readonly-value {
  display: block;
  width: 100%;
  max-width: 100%;
  align-self: stretch;
  box-sizing: border-box;
  border-bottom: 1px solid var(--vscode-panel-border);
}
```
Trên `.panel-left` / `.form-row` grid: `justify-items: stretch` (tránh `center`/`start` làm co ngang). `align-items: center` chỉ căn dọc — nếu đang làm co width thì đổi thành `align-items: center` + `justify-items: stretch` rõ ràng, hoặc `align-items: stretch` + căn giữa bằng flex trong cell.

3. **Không** dùng `width: fit-content` / `display: inline` cho `.readonly-value`.

4. Áp dụng mọi `%l` / `read_only` (vd `ten_nv_bg1%l` cùng tab).

5. Rebuild `npm run build:preview-form`.

═══════════════════════════════════════
### D) Không làm / ghi chú fidelity
═══════════════════════════════════════

- Không sửa TNTran.xml.
- Không coi thiếu `anchor` là bug Preview (tab 12 không anchor → không giãn hết webview là đúng rule FEAT-03).
- Không đổi nghĩa `split` / Tab focus (FEAT-04).

### Done
- [ ] `ten_dv`: gạch dưới dài ≈ tổng width các cột span (~543px), không còn chỉ dài chữ `ten_dv`
- [ ] `col_span` trailing `0` còn đúng sau split
- [ ] `%l` / readOnly khác cùng hành vi full cell
```

---

## Kết luận khảo sát (cho user / Gemini)

| Câu hỏi | Kết luận |
|---------|----------|
| `split="11"` sai? | **Không** — khớp pattern 11 cột trái |
| XML `ten_dv` hẹp? | **Không** — pattern `10000000` → ~543px |
| Vì sao gạch ngắn? | **Bug Preview CSS/stretch** (và/hoặc mất col_span) |
| Vì sao không hết nửa form? | Tab **không `anchor`** → panel không `1fr` giãn |
