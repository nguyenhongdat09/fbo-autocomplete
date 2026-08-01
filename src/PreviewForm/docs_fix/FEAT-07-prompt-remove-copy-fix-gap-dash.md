# Prompt Gemini — FEAT-07: Gỡ Copy for Agent + fix input dính (pattern `-` CTNTran)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm`).

User xác nhận: **Copy for Agent không đạt mục đích → bỏ hẳn.**  
Đồng thời **fix** preview CTNTran: input dính sát trong khi XML có `-` tạo khoảng cách.

---

## Prompt

```
Hai việc trong cùng PR — làm đủ.

═══════════════════════════════════════
### A) GỠ chức năng Copy for Agent (FEAT-06) — bắt buộc
═══════════════════════════════════════

Lý do: copy snapshot không giúp Agent sửa XML đúng ý; **không đạt mục đích** → xóa sạch, không để nút chết / code chết.

Xóa / hoàn tác mọi thứ liên quan:
- Nút toolbar `Copy for Agent` / `Copy Agent` / tương tự
- Handler `copyToClipboard` / `build_agent_snapshot` / markdown snapshot
- `postMessage` type copy ở webview + `PreviewFormPanel.js` (`vscode.env.clipboard…`)
- State/`file_name` chỉ phục vụ copy (nếu không dùng chỗ khác thì bỏ)
- Không giữ feature flag “tắt tạm”

Sau A: toolbar chỉ còn Anchor / Split (và control khác đã có từ trước FEAT-06).

═══════════════════════════════════════
### B) FIX: pattern `-` phải tạo khoảng cách — CTNTran đang dính input
═══════════════════════════════════════

### XML (CTNTran) — không sửa file XML

```xml
<!-- ~L620–622 -->
<item value="10-10-10---10--: [con_in_mm_ngang].Description, [vung_in_mm_ngang].Description, [bo_tri_con_in_ngang].Description, [kc_con_in_mm_ngang].Description"/>
<item value="11-11-11-1-11--: [con_in_mm_ngang].Label, [con_in_mm_doc].Label, …"/>
<item value="11-11-11-1-11--: [con_in_mm_ngang], [con_in_mm_doc], [vung_in_mm_ngang], [vung_in_mm_doc], …"/>

<category index="19" columns="100,100,30,100,100,30,100,100,30,100,30,100,100,0,0" anchor="14" split="14">
```

Skill fbo-design-view-field: ký tự **`-`** = **khoảng trống thật** (chiếm width cột `columns`), không gán field.

Map cột (0-based) với `11-11-11-1-11--` + columns trên:

| Col | Pattern (row input) | Width | Vai trò |
|-----|---------------------|-------|---------|
| 0–1 | `11` | 100+100 | Ngang + Dóc nhóm 1 |
| **2** | **`-`** | **30** | **GAP giữa nhóm** |
| 3–4 | `11` | 100+100 | nhóm 2 |
| **5** | **`-`** | **30** | **GAP** |
| 6–7 | `11` | … | nhóm 3 |
| **8** | **`-`** | **30** | **GAP** |
| 9 | `1` | 100 | so_con_in |
| **10** | **`-`** | **30** | **GAP** |
| 11–12 | `11` | … | Khoảng Cách |
| 13–14 | `--` | 0 | ẩn |

Row Description `10-10-10---10--`: các `-` cũng phải giữ chỗ (title nhóm không dính liền).

**Bug (ảnh user):** các ô input (và nhóm) **dính sát** — khoảng 30px của `-` không thấy / bị nuốt. Trên web có khoảng cách nhờ đúng columns + gap.

### Fix B (bắt buộc làm tới khi gap nhìn thấy)

1. Parser đã có `{ type:'empty', start_col }` cho `-` — **giữ**. Kiểm tra không bị drop khi `split="14"`.

2. Render empty — **ép đúng px cột**:
```js
const gap_px = Number(widths[c.start_col]) || 0;
html`<div class="form-cell-empty"
  style="grid-column: ${c.start_col+1} / span 1; width:${gap_px}px; min-width:${gap_px}px; max-width:${gap_px}px;"></div>`
```

3. CSS: `.form-cell-empty` **không** `min-width: 0` theo kiểu cho co về 0. `box-sizing: border-box; flex-shrink: 0`.

4. `grid-template-columns` vẫn có track `30px` / `minmax(30px,30px)` tại index gap — không bỏ cột.

5. Control `vscode-text-field` `overflow: hidden` + `min-width: 0` trên `.form-cell` — **không tràn đè** lên cột gap.

6. Debug tạm (xong xóa): `.form-cell-empty { outline: 1px solid red; }` → phải thấy dải ~30px giữa các nhóm. User accept khi **bỏ outline vẫn còn khoảng trống** giữa nhóm (không dính một khối).

7. **Không** dùng `column-gap` trên grid (lệch tổng px columns).

8. Cặp `11` (Ngang|Dóc trong cùng nhóm) XML **không** có `-` giữa hai field — kề cột 100+100 là đúng. Nếu sau khi gap 30px giữa nhóm đã hiện mà trong cặp vẫn “sát biên” do toolkit full width: thêm `padding-right: 4px` trên `.form-cell` control (không đụng empty) cho gần cảm giác web — **phụ**, ưu tiên gap `-` 30px trước.

### Không làm
- Không sửa CTNTran.xml.
- Không làm lại / giữ Copy for Agent.
- Không `column-gap` làm lệch columns.

### Files
- `media/src/main.js` — gỡ copy; empty cell ép width
- `media/src/previewForm.css` — empty cell; optional padding control
- `PreviewFormPanel.js` — gỡ clipboard handler nếu đã thêm
- Rebuild: `npm run build:preview-form`

### Done
- [ ] Không còn nút / code Copy for Agent
- [ ] CTNTran tab 19: giữa các nhóm (sau cột `-` width 30) có khoảng trống nhìn thấy — input không còn dính khối như ảnh
- [ ] Outline debug đã gỡ
```

---

## Nhắc nhanh cho Gemini

```
FEAT-06 Copy  →  XÓA
Pattern `-`   →  cột 30px phải CHIẾM CHỖ (empty ép min-width)
User ảnh     →  input dính = gap bị nuốt / đè — không phải “XML thiếu -”
```
