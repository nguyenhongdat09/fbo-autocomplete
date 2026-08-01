# Prompt Gemini — FEAT-08b: Click reveal khi field đến từ `&Entity;` (vd `&Revert.Field.0;` → `ngay_ct`)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm`).

---

## Prompt

```
Fix Preview Form **click → nhảy XML**: đang fail khi field trên Preview là tên **đã flat**, trong khi file nguồn còn **entity ref**.

═══════════════════════════════════════
### Bug (TNTran L657)
═══════════════════════════════════════

Nguồn XML (chưa flat):
```xml
<item value="111000-100111111: [dept_id].Label, [dept_id], [ten_bp%l], [&Revert.Field.0;].Label, [&Revert.Field.0;], [stt_rec], …"/>
```

Sau `XmlEntityExpander` / entityResolver: `&Revert.Field.0;` → field thật (vd **`ngay_ct`**).

Preview hiện input **Ngày lập** / `ngay_ct`.  
Click reveal gửi `field: "ngay_ct"` + `raw_item_value` **đã flat** (chứa `[ngay_ct]`, không còn `&Revert.Field.0;`).

`PreviewFormPanel._revealViewItem` hiện:
1. Exact `value="${raw_item_value}"` → **fail** (file nguồn khác chuỗi flat).
2. Fallback: dòng có `pattern` + `[ngay_ct]` → **fail** (nguồn chỉ có `[&Revert.Field.0;]`).

→ User không nhảy được tới L657.

═══════════════════════════════════════
### Fix — chuỗi tìm kiếm (Host, bắt buộc)
═══════════════════════════════════════

Trong `_revealViewItem(msg)`, tìm dòng `<item` theo thứ tự (dừng khi hit):

**B1.** Exact `msg.raw_item_value` trong `value="..."` (case field không entity — giữ).

**B2.** Pattern + `[field]` trên cùng dòng (giữ).

**B3. NEW — Pattern + entity ref trỏ về field (quan trọng):**  
Dùng `entityResolver.getEntitiesForFile(this._uri.fsPath)` (cùng core flatten).  
Với mỗi general entity `name` → `decl`:
- Nếu replacement / text entity **bằng** `msg.field`, hoặc chứa `[msg.field]`, hoặc flatten ra đúng tên field (cùng cách expander resolve `Revert.Field.0`):
  - Tìm dòng có `pattern` (phần trước `:`) **và** có `&{name};` hoặc `[&{name};]` hoặc `[&{name};].Label`.
- Ví dụ field `ngay_ct` ↔ entity `Revert.Field.0` → match dòng chứa `[&Revert.Field.0;]`.

**B4. NEW — Pattern alone (an toàn):**  
Dòng `<item` chứa đúng `pattern` (vd `111000-100111111`) và `value=`.  
Reveal cả dòng item (selection full line hoặc `value="..."`).  
Đủ để Developer thấy `&Revert.Field.0;` dù chưa highlight đúng token.

**B5.** Vẫn fail → warning rõ: nêu field + gợi ý “có thể đang là &Entity; trong XML”.

Khi match bằng entity (B3): ưu tiên `selection` / highlight đoạn `[&Revert.Field.0;]` (hoặc `.Label` nếu click label), không chỉ đầu dòng.

Sửa luôn message warning đang lỗi encoding (`KhA'ng tAm thy…`) → tiếng Việt đúng UTF-8.

═══════════════════════════════════════
### Optional (parser / model — nếu dễ)
═══════════════════════════════════════

Gắn thêm trên cell hoặc row (không bắt buộc nếu B3–B4 đủ):
- `source_token`: nếu lúc parse flat còn biết span entity — khó.  
Ưu tiên **fix Host reveal** trước.

Webview vẫn gửi:
```js
{ type: 'revealViewItem', raw_item_value, field, start_col, role }
```
`role === 'label'` → tìm `[&Ent;].Label` hoặc `[field].Label`.

═══════════════════════════════════════
### Không làm
═══════════════════════════════════════

- Không bắt user bỏ `&Revert.Field.*;` trong XML.
- Không đổi flatten / entityResolver semantics.
- Không copy-for-agent.

### Files
- `PreviewFormPanel.js` — `_revealViewItem` B3–B5 + entityResolver reverse lookup
- (nhẹ) `main.js` — gửi thêm `role` nếu chưa có
- Rebuild không bắt buộc nếu chỉ sửa Panel host — Reload Window là đủ

### Done
- [ ] Click field Ngày lập / `ngay_ct` trên Preview → nhảy TNTran ~L657, thấy `[&Revert.Field.0;]`
- [ ] Click label tương ứng → highlight `[&Revert.Field.0;].Label` nếu có
- [ ] Field không entity (vd `dept_id`) vẫn reveal như cũ
- [ ] Warning tiếng Việt đọc được khi thật sự không tìm thấy
```

---

## Nhắc

```
Preview (flat):  [ngay_ct]
XML nguồn:       [&Revert.Field.0;]
Reveal phải:     pattern + reverse entity  OR  pattern alone
```
