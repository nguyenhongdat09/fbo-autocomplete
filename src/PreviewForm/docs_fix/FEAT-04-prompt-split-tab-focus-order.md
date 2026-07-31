# Prompt Gemini — FEAT-04: Tab focus theo Split (phần 1 xong phần 2)

Copy khối **Prompt** cho Gemini (`@src/PreviewForm`).

Skill: `fbo-design-view-field` — `split` quyết định **thứ tự Tab**, không chỉ layout 2 panel.

Popup guide Split hiện có (giữ đúng ý):
> Đây là đường chia cắt Form ra 2 phần. Khi bấm Tab sẽ Focus vào các Field Phần 1 sau đó mới tới các Field phần 2

---

## Prompt

```
Thêm Preview Form: mô phỏng **thứ tự focus phím Tab** theo `split` (giống runtime FBO).

═══════════════════════════════════════
### A) Hành vi đúng (FBO)
═══════════════════════════════════════

`split="N"` cắt columns thành:
- **Phần 1 (panel trái):** cột 1..N (1-based) = `column_widths[0 .. N-1]`
- **Phần 2 (panel phải):** cột còn lại

Khi bấm **Tab** liên tục trong zone đang xem (Thông tin chung / 1 tab / footer nếu có split):

1. Focus lần lượt **mọi control focusable thuộc Phần 1**, theo thứ tự **trên → dưới** (thứ tự row trong view), trong cùng row: trái → phải trong panel 1.
2. **Sau khi hết** Phần 1 → nhảy sang **Phần 2**, lại **trên → dưới**.
3. **Không** Tab theo kiểu từng dòng: trái→phải rồi xuống dòng (đó là DOM mặc định hiện tại — SAI với FBO split).

**Shift+Tab:** ngược lại (Phần 2 từ dưới lên, rồi về Phần 1).

Zone / nguồn split (giống layout):
| Zone | split từ |
|------|----------|
| General | `view.split` |
| Tab | chỉ `category.split` nếu có (không inherit view) |
| Footer `-1` | chỉ `footer_category.split` nếu có; thường null → không áp rule 2 phần |

Không có `split` → Tab tuần tự DOM/top-bottom trong zone (một panel).

═══════════════════════════════════════
### B) Field nào được focus / bị bỏ qua
═══════════════════════════════════════

**Được focus** (control nhập liệu):
- `role === 'control'`
- `kind` ∈ input / dropdown / date / checkbox (có thể focus)
- Không bị loại ở dưới

**Không focus** (bỏ qua khi Tab):
| Điều kiện | Ghi chú |
|-----------|---------|
| `readOnly="true"` / `f.read_only` | Đã render `.readonly-value` (span) — không tabindex |
| `disabled="true"` / `f.disabled` | `disabled` trên control + không vào chuỗi Tab |
| **Inactive** | XML thường `inactive="true"` hoặc `inactivate="true"` (user gọi Innactive) — parse vào model `inactive: boolean`, coi như không focus (có thể vẫn hiện, opacity mờ optional) |
| `hidden` / cột width `0` | Không render / hidden |
| `role` label / description / lookup_name (`%l`) | Plain text — không focus |
| `kind === 'grid'` | Placeholder grid — **không** focus (MVP) |

Parser (`classifyField.js`): thêm
```js
inactive = String(field['@_inactive'] || field['@_inactivate'] || '').toLowerCase() === 'true'
```
đưa vào FieldDef.

═══════════════════════════════════════
### C) Vì sao DOM hiện tại sai
═══════════════════════════════════════

Mỗi `form-row-split` render: panel-left (controls dòng đó) rồi panel-right (cùng dòng).  
Tab browser mặc định → **từng dòng** trái→phải, không phải **hết cột trái rồi mới cột phải**.

Phải **ép tabindex / quản lý Tab** theo thứ tự FBO.

═══════════════════════════════════════
### D) Implement gợi ý
═══════════════════════════════════════

#### Cách khuyến nghị: gán `tabIndex` tuần tự trong CategoryPanel

Sau khi có `rows` + `split`:

1. Duyệt **tất cả rows** theo thứ tự mảng.
2. Thu thập control focusable **phần 1** (`start_col < split`) theo thứ tự cells trong row.
3. Rồi thu thập control focusable **phần 2** (`start_col >= split`).
4. Gán `tabIndex={1..n}` (hoặc base offset theo zone) lần lượt.
5. Control không focusable: `tabIndex={-1}` hoặc không set / không dùng element focusable.

Truyền `tab_index` xuống `FieldControl` / `FormRow`.

Hoặc:

#### Cách 2: `keydown` Tab trên `.category-panel`

- Query `[data-fbo-focusable]` theo thứ tự đã sắp (part1 rồi part2).
- Tab / Shift+Tab: `preventDefault` + `focus()` phần tử kế / trước.
- Phức hơn một chút nhưng không phụ thuộc số tabIndex toàn trang.

MVP chọn **Cách 1 (tabIndex)** trừ khi đụng toolbar VS Code.

#### FieldControl

```js
// focusable control
html`<vscode-text-field tabindex=${tab_index} disabled=${…} …>`
// non-focusable
html`<span class="readonly-value" …>`  // không tabindex
// disabled / inactive
html`<vscode-text-field disabled tabindex="-1" …>`
```

Inactive: nếu vẫn dùng input để nhìn — `disabled` + `tabindex=-1` + class mờ (optional).

#### Phạm vi focus

- Mỗi `CategoryPanel` (general / tab active / footer) có chuỗi Tab **riêng** trong panel đó.
- Tab UI chuyển tab (`.fbo-tab-item`) không cần nằm trong chuỗi field (hoặc tabindex cao hơn / tách riêng).
- Toolbar Anchor/Split: không xen vào giữa field (tabindex=-1 hoặc để cuối).

═══════════════════════════════════════
### E) Không làm
═══════════════════════════════════════

- Không đổi vị trí sọc Split / Anchor.
- Không đổi semantics `split` layout (panel L/R).
- Không bắt buộc simulate focus toàn bộ app FBO (chỉ Preview webview).
- Không cho label / `%l` / readOnly vào chuỗi Tab.

═══════════════════════════════════════
### F) Files / Done
═══════════════════════════════════════

Files:
- `parser/classifyField.js` (+ test) — `inactive`
- `media/src/main.js` — thu thập thứ tự focus + `tabIndex` / Tab handler; FormRow/FieldControl
- `media/src/previewForm.css` — optional style `:focus-visible` rõ trên dark theme
- Rebuild: `npm run build:preview-form`

Done:
- [ ] TNTran general `split="7"`: Tab hết field trái (trên→dưới) rồi mới field phải (Ngày LCT, …)
- [ ] Không dừng ở readOnly / disabled / inactive / `%l` / label
- [ ] Shift+Tab đảo ngược đúng
- [ ] Zone không `split`: Tab tuần tự bình thường
- [ ] Tab category có `split` riêng: áp dụng trong tab đó
```

---

## Sơ đồ nhớ

```
Rows (trên → dưới):
  Row1: [P1 fields…] [P2 fields…]
  Row2: [P1 fields…] [P2 fields…]

Tab order FBO:
  P1-R1 → P1-R2 → … → P2-R1 → P2-R2 → …

Tab order SAI (DOM hiện tại):
  P1-R1 → P2-R1 → P1-R2 → P2-R2 → …
```
