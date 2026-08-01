# Prompt Gemini — FEAT-05: Description/Label HTML + khoảng cách pattern `-`

Copy khối **Prompt** cho Gemini (`@src/PreviewForm`).

Fixture: `CTNTran.xml` tab category **19** (so sánh Preview vs form web).

---

## Prompt

```
Fix Preview Form — 2 phần liên quan CTNTran tab kích thước con in (làm cùng PR).

═══════════════════════════════════════
### A) HTML trong footer (Description) + header (Label)
═══════════════════════════════════════

User cố ý nhét HTML vào XML để web trình diễn (spacer / hook CSS), không phải label hệ thống thuần.

Ví dụ CTNTran:
```xml
<!-- Description / group title -->
<footer v="Kích thước con in&lt;span id='fsd_sp_row_02' />" …/>
<footer v="&lt;span style='opacity: 0;'>.&lt;/span>" …/>

<!-- Label kèm span ẩn (hook layout FBO) -->
<header v="Ngang&lt;span id='fsd_sp_row_01' />" …/>
```

View:
```xml
<item value="-----------1---: [con_in_mm_doc].Description"/>
<item value="10-10-10---10--: [con_in_mm_ngang].Description, [vung_in_mm_ngang].Description, …"/>
<item value="11-11-11-1-11--: [con_in_mm_ngang].Label, [con_in_mm_doc].Label, …"/>
<item value="11-11-11-1-11--: [con_in_mm_ngang], [con_in_mm_doc], …"/>
```

**Bug Preview (ảnh 1):**  
- Description/Label hiện **chuỗi thô** `&lt;span…` / `<span id='…` cạnh chữ “Ngang” (escape text) → rối + tràn.  
- FIX-04 `strip_html` trên footer → mất spacer opacity 0 / mất ý đồ HTML.

**Đúng (ảnh 2 / web):** HTML được **render**; span ẩn/opacity 0 không lộ tag; title group (“Kích thước con in”) hiện đẹp.

**Fix A:**
1. `classifyField`: **không** `strip_html` cho `footer_v` / `footer_e` (và `header_v` / `header_e` nếu đang strip). Giữ HTML sau decode entity (`&lt;`→`<`).
2. `FieldControl`:
   - `role === 'description'` → render HTML (`dangerouslySetInnerHTML`), class `description-html` — **không** italic/opacity mặc định che CSS user.
   - `role === 'label'` → nếu `header_v` (hoặc display string) **có thẻ HTML** (`/<[a-z]/i`) thì render HTML; không thì plain text như cũ. Span `id='fsd_sp_*'` trên web thường invisible — Preview không được hiện raw tag.
3. Test: footer/header chứa `&lt;span` → model còn `<span`; UI không lộ chữ `<span`.

═══════════════════════════════════════
### B) Pattern `-` phải giữ khoảng cách cột (gap 30px)
═══════════════════════════════════════

Category 19:
```xml
<category index="19" columns="100,100,30,100,100,30,100,100,30,100,30,100,100,0,0" anchor="14" split="14">
```

Pattern: `11-11-11-1-11--` (15 ký tự = 15 cột).

Các `-` map đúng cột width **30** (và `0` ở cuối):

| start_col | char | width | Vai trò |
|-----------|------|-------|---------|
| 2, 5, 8, 10 | `-` | **30** | Gap giữa nhóm Ngang/Dọc |
| 13, 14 | `-` | 0 | Ẩn |

Parser `viewItemUtils` đã push `{ type:'empty', start_col }` — **đúng**.  
**Bug UI:** Preview nhìn như **dính sát** (ảnh 1), trong khi web có khoảng giữa các nhóm (ảnh 2).

Nguyên nhân cần xử lý (làm đủ):
1. **`.form-cell-empty` không chiếm track** — bắt buộc:
   ```css
   .form-cell-empty {
     min-width: 0;
     width: 100%;
     height: 100%;
     /* hoặc min-height: 1px — miễn grid area 30px không collapse */
   }
   ```
   Render: `grid-column: ${start_col+1} / span 1` (đủ start+end), không chỉ `grid-column-start`.
2. **Label `overflow: visible` tràn sang cột gap** — nhất là khi header còn raw HTML dài.  
   Label cell: `overflow: hidden` (clip theo width cột) **hoặc** ít nhất không tràn sang cột `-`. Gap 30px phải **nhìn thấy** khoảng trống giữa input/label nhóm này và nhóm kia.
3. Verify sau split=`14`: empty `start_col` 2,5,8,10 vẫn nằm panel trái; `grid-template-columns` vẫn có `minmax(30px,30px)` tại các index đó (không nuốt track).
4. Không “gộp” bỏ empty cells khi render.

**Không** tăng width 30 trong parser — fidelity đúng XML; chỉ cần gap 30px hiện ra như web.

═══════════════════════════════════════
### C) Không làm / Done
═══════════════════════════════════════

Không làm:
- Không sửa CTNTran.xml.
- Không bỏ pattern `-`.
- Không strip HTML Description/Label “cho sạch”.

Files:
- `parser/classifyField.js` (+ test)
- `media/src/main.js` — FieldControl HTML; empty cell grid-column
- `media/src/previewForm.css` — `.form-cell-empty`, `.description-html`, label overflow
- Rebuild: `npm run build:preview-form`

Done:
- [ ] Description/Label HTML: không lộ raw `<span…`; spacer opacity 0 / group title đúng
- [ ] `11-11-11-1-11--`: có khoảng trống ~30px giữa các cặp Ngang|Dọc (giống web hơn ảnh 1)
- [ ] Empty cell `-` vẫn trong DOM + track 30px
```

---

## Kết luận khảo sát

| Hiện tượng | Nguyên nhân |
|------------|-------------|
| Gạch/chữ dính sát, mất gap `-` | Cột gap = **30px** (đúng XML); Preview empty cell / label tràn làm **mất khoảng nhìn thấy** |
| Lộ `<span id=…` cạnh Ngang | `header`/`footer` chứa HTML bị **escape text**, chưa render HTML |
| `split="11"`/`14` | Không phải thủ phạm chính cho mất gap 30px |

```
columns: 100,100,30,100,100,30,…
pattern: 1 1 - 1 1 - …
                 ↑ gap 30px — phải hiện khoảng trống
```
