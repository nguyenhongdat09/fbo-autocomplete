# docs_fix — Việc Gemini cần làm (bổ sung)

> **`../docs/` đã xong — không sửa lại docs gốc trừ khi user yêu cầu.**  
> Thư mục **`docs_fix/` này** là nơi Gemini đọc để biết **còn phải fix gì trong code**.

| Đọc trước | Mục đích |
|-----------|----------|
| [`PRINCIPLE-design-fidelity.md`](./PRINCIPLE-design-fidelity.md) | Mục đích chính: preview = gương thiết kế FBO |
| File này (`README.md`) | Danh sách FIX P0→P2 |
| [`FIX-01-categories.md`](./FIX-01-categories.md) | Chi tiết mất Tabs |
| [`FIX-02-03-width0-grid.md`](./FIX-02-03-width0-grid.md) | Width 0 ẩn cột + grid placement |
| [`FIX-09-tab-wrap-name-split.md`](./FIX-09-tab-wrap-name-split.md) | Tab wrap; input hiện name; split trái/phải |
| [`FIX-10-save-reload-path-guard.md`](./FIX-10-save-reload-path-guard.md) | Ctrl+S chỉ reload khi panel mở; chỉ `Dir/*.xml` & `Filter/*.xml` |
| [`FIX-11-prompt-footer-missing-fields.md`](./FIX-11-prompt-footer-missing-fields.md) | Footer xa; **Bug A categoryIndex mix = đúng, không fix zone** |
| [`FIX-12-13-prompt-label-footer.md`](./FIX-12-13-prompt-label-footer.md) | Label = web (không wrap); footer sát nhau |
| [`FIX-14-prompt-footer-position-label-width.md`](./FIX-14-prompt-footer-position-label-width.md) | Footer theo `------` gần cuối; label đủ px XML |
| [`FIX-15-label-column-shrink.md`](./FIX-15-label-column-shrink.md) | Label bị che vì cột co + font — `minmax` / flex-shrink:0 / font 12px |
| [`FIX-16-prompt-label-pad-just-enough.md`](./FIX-16-prompt-label-pad-just-enough.md) | **Prompt:** giảm `LABEL_COL_PAD_PX` cho vừa như form web (ảnh 2) |
| [`FIX-17-prompt-footer-fallback-master-columns.md`](./FIX-17-prompt-footer-fallback-master-columns.md) | **Prompt:** footer `-1` không khai `<category index="-1">` → `column_widths` = master (vd Filter SITran) |
| [`FIX-18-prompt-footer-right-align-short-input.md`](./FIX-18-prompt-footer-right-align-short-input.md) | **Prompt:** footer TNTran lệch giữa + input dài → phải sát phải, input ~100px như web |
| [`FEAT-01-prompt-anchor-split-guides.md`](./FEAT-01-prompt-anchor-split-guides.md) | **Prompt tính năng:** nút bật/tắt sọc Anchor & Split (2 màu) |
| [`FEAT-01b-prompt-fix-anchor-position.md`](./FEAT-01b-prompt-fix-anchor-position.md) | **Prompt fix:** sọc Anchor=6 = mép phải cột 147 / cuối ten_bp |
| [`FEAT-01c-prompt-fix-split-position.md`](./FEAT-01c-prompt-fix-split-position.md) | **Prompt fix:** sọc Split=7 = đầu panel phải / đầu Ngày LCT (cột 58) |
| [`FEAT-01d-prompt-tab-no-inherit-guides.md`](./FEAT-01d-prompt-tab-no-inherit-guides.md) | **Prompt:** tab không kế thừa guide; sọc Anchor = **đầu** cột (không cuối) |
| [`FEAT-02-prompt-guide-hover-tooltip.md`](./FEAT-02-prompt-guide-hover-tooltip.md) | **Prompt:** hover sọc Anchor/Split → popup giải thích cho Developer |
| [`FEAT-03-prompt-anchor-live-resize.md`](./FEAT-03-prompt-anchor-live-resize.md) | **Prompt:** kéo rộng Preview → cột/field theo `anchor` **giãn thật** (không chỉ kẻ sọc) |
| [`FEAT-04-prompt-split-tab-focus-order.md`](./FEAT-04-prompt-split-tab-focus-order.md) | **Prompt:** phím Tab theo Split — hết Phần 1 (trên→dưới) rồi Phần 2; bỏ readOnly/disabled/inactive |
| [`FEAT-01e-prompt-footer-anchor-guide.md`](./FEAT-01e-prompt-footer-anchor-guide.md) | **Prompt fix:** footer `anchor` kẻ sọc + popup sticky sát thanh guide |
| [`FEAT-01f-prompt-footer-anchor-start-of-column.md`](./FEAT-01f-prompt-footer-anchor-start-of-column.md) | **Prompt fix:** footer sọc Anchor vẫn ở **cuối** width → phải **đầu** cột (giống General) |
| [`FEAT-01g-prompt-footer-anchor-end-of-column.md`](./FEAT-01g-prompt-footer-anchor-end-of-column.md) | **Prompt:** footer `anchor` kẻ **cuối** cột (đè chữ label); General/Tab giữ đầu cột |

Spec đầy đủ (đã viết sẵn, chỉ tham chiếu): [`../docs/README.md`](../docs/README.md) → `02-domain-rules.md`.

Khi mâu thuẫn giữa code/fixture cũ và list này → **làm theo docs_fix**.

---

## Bổ sung bắt buộc (user 30/07): Design fidelity

**Mục đích chính của feature:** Developer thiết kế `view`/`item`/`columns`/`categoryIndex` → nhìn Preview → **thấy lỗi khai báo ở đâu** → sửa lại XML.

Gemini khi fix **phải**:

1. Tuân thủ quy tắc layout FBO gốc (pattern `1`/`0`/`-`, columns px, width `0` = ẩn, tab theo thứ tự XML, footer `-1`, height tab).
2. **Không** che lỗi (không map width `0`→`auto`, không dồn gap `-`, không tự reorder field).
3. Skin Toolkit OK — **cấu trúc cột/zone phải 1:1 với XML**.

Chi tiết: [`PRINCIPLE-design-fidelity.md`](./PRINCIPLE-design-fidelity.md).

---

## Triệu chứng hiện tại (TNTran preview)

1. Layout general lộn xộn, chồng chữ, ô trống linh tinh.
2. **Không thấy Tabs** (1.1, 1.2, …).
3. Cột `width = 0` trong master vẫn hiện field (`stt_rec`, `ma_nk`, …).
4. Chữ bẩn: `ten_bp_name`, `readonly`, raw HTML `Xem...`.

---

## Việc cần làm (checklist)

### P0 — làm trước (layout / tab chết)

- [ ] **FIX-01** Parse `<categories>` từ `view.categories`, `@_columns`; bỏ `dir.category` + `processItems(cat.item)`. Sửa fixture `mini-dir.xml` đúng FBO. → **Hiện Tabs.**  
  → Chi tiết: [FIX-01-categories.md](./FIX-01-categories.md)

- [ ] **FIX-02** `columns` giá trị `0` = **ẩn** cột/field; `hidden="true"` / field `width="0"` cũng ẩn. Cấm CSS `0 → auto`.  
  → [FIX-02-03-width0-grid.md](./FIX-02-03-width0-grid.md)

- [ ] **FIX-03** Grid placement đúng pattern: gap `-` giữ chỗ; `grid-column-start` (hoặc đủ N ô). Không auto-place dồn trái.  
  → cùng file FIX-02-03

### P1

- [ ] **FIX-11** Footer không `view.split` (Bug A mix categoryIndex = **đúng, không đổi zone**).  
  → [FIX-11-prompt-footer-missing-fields.md](./FIX-11-prompt-footer-missing-fields.md)
- [ ] **FIX-12/13** Label 1 dòng giống web (đủ width → đủ chữ; thiếu → che, **không wrap**); footer bỏ `view.split`, label sát input.  
  → [FIX-12-13-prompt-label-footer.md](./FIX-12-13-prompt-label-footer.md)
- [ ] **FIX-14** Footer không nằm giữa — đúng pattern `------10-11` + columns (gần cuối); label «Ghi chú công việc» đủ width như XML/web.  
  → [FIX-14-prompt-footer-position-label-width.md](./FIX-14-prompt-footer-position-label-width.md)
- [ ] **FIX-15** Label không bị co hẹp hơn XML (`minmax`, flex-shrink:0, font 12px) — «Ghi chú công việc» khớp web.  
  → [FIX-15-label-column-shrink.md](./FIX-15-label-column-shrink.md)
- [ ] **FIX-04** `%l` hiện đúng name field (không `ten_bp_name`); Description strip HTML → `Xem...`; checkbox không lặp label. (Hợp 09b: control hiện name.)
- [ ] **FIX-05** Tab/footer `column_widths` từ category; rows từ view item + `categoryIndex`.
- [ ] **FIX-06 / FIX-10** Panel HTML một lần + `ready`; **Ctrl+S chỉ refresh khi panel đang mở** (không keybinding cướp Ctrl+S); **bỏ live debounce gõ phím**; path chỉ `Dir/file.xml` hoặc `Filter/file.xml` (không subfolder, không Grid).  
  → [FIX-10-save-reload-path-guard.md](./FIX-10-save-reload-path-guard.md)

### P2 / Feature

- [ ] **FEAT-01** Nút bật/tắt hiển thị sọc **Anchor** (cam) và **Split** (cyan) trên general + tab.  
  → Prompt: [FEAT-01-prompt-anchor-split-guides.md](./FEAT-01-prompt-anchor-split-guides.md)

- [ ] **FIX-07** `view.height` trên tab body + banner tràn.
- [ ] **FIX-08** (tuỳ chọn) Nếu cần, bổ sung một dòng vào `docs/02` về width `0` — **chỉ khi user bảo**; mặc định ghi đủ trong docs_fix là được.

### Sau mỗi P0

```text
build previewForm bundle → Reload Window → mở TNTran → Preview Form
```

---

## Nghiệm thu nhanh (đủ để Developer “thấy lỗi khai báo”)

- [ ] Có tab theo đúng thứ tự XML.
- [ ] Tab có grid → `{name}_Grid`.
- [ ] Cột width `0` → field **không** hiện (Developer biết đã ẩn).
- [ ] Pattern gap `-` tạo khoảng trống thật (sai pattern → lệch rõ).
- [ ] Quên `categoryIndex` → field ở general (đúng tín hiệu).
- [ ] Không `ten_bp_name` / `readonly` / raw `<div...`.
- [ ] Footer `-1` sticky khi đổi tab.
- [ ] Panel phải (Ngày lập…) canh phải; panel trái canh trái (FIX-09c).
- [ ] Tab xuống dòng khi tràn (FIX-09a); input hiện name field (FIX-09b).
- [ ] Ctrl+S khi **không** Preview → không bung panel; khi **có** Preview → reload (FIX-10).
- [ ] Chỉ mở được `Dir/*.xml` / `Filter/*.xml` trực tiếp; `Dir/Sub/x.xml` & `Grid/x.xml` bị chặn.

---

## File code cần đụng

| File | Fix |
|------|-----|
| `parser/FormXmlParser.js` | 01, 02, 05 |
| `parser/viewItemUtils.js` | 02, 03 |
| `parser/classifyField.js` | 02 hidden, 04 |
| `media/src/main.js` | 02–04, 07 |
| `media/src/previewForm.css` | 03, 07 |
| `PreviewFormPanel.js` | 06 |
| `tests/fixtures/mini-dir.xml` + tests | 01 + case width 0 |

---

## FIX chi tiết

### FIX-01 — P0: Parse `<categories>` sai chỗ → mất Tabs

**Nguyên nhân:** `FormXmlParser.js` lấy `dirNode.category` (sai). FBO thật: `view.categories.category` + `@_columns`.

**Phải làm:**
1. Categories từ `viewElement.categories.category`.
2. `columns` từ `@_columns`, không từ `cat.item[0]`.
3. Không `processItems(cat.item)` — rows tab = item trong **view** theo `categoryIndex` field.
4. `index="-1"` → footer; thứ tự tab = declaration order.
5. Sửa `tests/fixtures/mini-dir.xml` đúng cấu trúc FBO (fixture cũ cố ý sai nên test “pass” giả).

→ [FIX-01-categories.md](./FIX-01-categories.md)

**Done:** TNTran có tab bar; `categories[0].header_v` chứa `1.1`.

---

### FIX-02 — P0: Cột width `0` = ẩn field

```xml
<item value="100, 110, 100, 90, 30, 147, 8, 58, 42, 8, 100, 0, 0, 0, 0"/>
<item value="111000-100111111: [dept_id].Label, [dept_id], [ten_bp%l], ..., [stt_rec], [ma_nk], ..."/>
```

Bug: `main.js` map `w === 0 ? 'auto'` → vẫn hiện.

**Phải làm:** cột/start width `0` → không render control; CSS `0px`; field `hidden="true"` / `@_width="0"` → ẩn.  
→ [FIX-02-03-width0-grid.md](./FIX-02-03-width0-grid.md)

**Done:** không còn `stt_rec` / `ma_nk` / `ma_*_tn` trên dòng đầu.

---

### FIX-03 — P0: CSS Grid lệch (bỏ empty)

Bug: `if (span || empty) return null` → auto-place dồn trái.

**Phải làm:** `grid-column-start` theo index pattern, hoặc render đủ ô empty giữ gap `-`.

**Done:** gap giữa 2 cột đúng; sai pattern → lệch rõ (đúng mục đích fidelity).

---

### FIX-09 — P1: Tab wrap + name trong input + split L/R

Chi tiết: [FIX-09-tab-wrap-name-split.md](./FIX-09-tab-wrap-name-split.md)

- **09a** Tab flex-wrap xuống dòng như form FBO.
- **09b** Control hiện `field.name` (`ma_kh`, `ngay_lct`…).
- **09c** `view.split`: panel 1 canh trái, panel 2 canh phải — không để Ngày lập dồn sát trái.

---

### FIX-04 — P1: Lookup / readOnly / Description HTML

| Hiện | Đúng |
|------|------|
| `ten_bp_name` | plain trống hoặc `—` |
| chữ `readonly` | span value trống |
| raw `<div>...Xem` | strip HTML → `Xem...` |
| checkbox + label trùng | checkbox không lặp `header_v` |

---

### FIX-05 — P1: Zone columns

`column_widths` tab/footer từ category; item `1: [grid]` vào `rows_by_category`; fallback master + warning nếu rỗng.

---

### FIX-06 / FIX-10 — Panel + Ctrl+S + path guard

Chi tiết: [FIX-10-save-reload-path-guard.md](./FIX-10-save-reload-path-guard.md)

- HTML một lần + handshake `ready`.
- **Không** đăng ký keybinding `Ctrl+S` → preview.
- `onDidSaveTextDocument` **chỉ khi panel đang mở** → refresh file đang preview.
- **Bỏ** refresh theo `onDidChangeTextDocument` (debounce) — user chốt: save mới reload.
- Path: chỉ `.../Dir/ten.xml` hoặc `.../Filter/ten.xml` (một cấp); chặn `Dir/A/a.xml`, `Grid/...`.

---

### FIX-07 — P2: Tab height

`view.height` → chiều cao tab body + overflow + banner nếu tràn.

---

### FIX-08 — P2: Docs gốc

Mặc định **không** sửa `../docs/`. Width `0` đã ghi trong docs_fix / PRINCIPLE. Chỉ cập nhật `docs/02` nếu user yêu cầu.

---

## Thứ tự implement

```
FIX-01 → FIX-02 → FIX-03 → FIX-09 → FIX-04 → FIX-05 → FIX-06 → FIX-07
```

Mỗi bước xong: rebuild bundle, Reload Window, kiểm TNTran với checklist ở trên.

