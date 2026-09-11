# FIX-10 — Tiêu đề chỉ tiếng Việt · EN tự dịch (tận dụng Translate) · layout mục 4/6

## Mức: Medium (UX + reuse Translate)

## Map ảnh user

| Hình | UI | Yêu cầu |
|------|-----|---------|
| **1** | Mục **4** — còn cặp **Tiêu đề VN / Tiêu đề EN** | Bỏ EN; layout gọn giống hàng tiêu đề mục 6 (1 ô tiêu đề VN) |
| **2** | Mục **6** Trace — hàng 1: Tên \| Kiểu \| Tiêu đề VN; hàng 2: **Tiêu đề EN** lẻ | Bỏ EN; **một hàng 3 cột** (Tên \| Kiểu SQL \| Tiêu đề) |

Nguyên tắc: user **chỉ nhập tiếng Việt**. Tiếng Anh dùng sẵn chức năng dịch của extension.

---

## Tận dụng Translate có sẵn (không viết API mới)

Extension đã có:

| Command / module | Phím | Việc |
|------------------|------|------|
| `fbo-autocomplete.translatePaste` | **Ctrl+Shift+V** | Clipboard VI → Google (`googletrans`) → paste EN vào editor |
| `TranslatedText` (`src/Translate/Translate.js`) | — | `trans_to_en(text)`, `trans_to_vi_batch(texts)` (VI→EN batch) |
| `fbo-autocomplete.ApplyTranslateFBO` | — | Quét XML `v="…" e=""` (e rỗng) → điền `e` hàng loạt |

**Chốt pipeline Retrieve Flow:**

1. **Wizard:** chỉ ô tiêu đề **tiếng Việt** (không input EN).
2. **Generate XML:** ghi `header v="{vn}" e=""` (e **rỗng** có chủ đích).
3. **EN:** một trong hai (ưu tiên A):

| Cách | Khi nào |
|------|---------|
| **A (khuyến nghị Generate)** | Host gọi `TranslatedText.trans_to_en` / batch **lúc Generate** (và optional Preview) → điền sẵn `e="…"` trong file xuất |
| **B (fallback / sau Generate)** | Để `e=""` → user mở XML → **ApplyTranslateFBO** hoặc copy VN + **Ctrl+Shift+V** dán EN |

Không gọi Google từ webview — chỉ **host** (`RetrieveFlowPanel` / generator), reuse `require('../Translate/Translate')` (đường dẫn đúng theo cấu trúc folder).

Fail dịch (mạng / API): giữ `e=""` + toast cảnh báo — user dùng Ctrl+Shift+V / ApplyTranslateFBO sau.

---

## UI — chỉ tiếng Việt

### Mục 4

Trước: `Tiêu đề VN cột đã lấy` + `Tiêu đề EN cột đã lấy`.

Sau:

| Label | Field |
|-------|--------|
| **Tiêu đề cột đã lấy** | `src_taken_header_v` only |

Bỏ `#src_taken_header_e` khỏi HTML/collect. Layout form-grid: hàng SL + kiểu; hàng tiêu đề **full-width hoặc 1 ô** (không cặp VN|EN).

### Mục 6 Trace Fields

Mỗi dòng **một hàng** `form-grid` 3 cột + nút X:

```
Tên trường đích     │  Kiểu SQL        │  Tiêu đề
[stt_rec_dxa    ]   │  [char(13)   ]   │  [ (để trống nếu ẩn) ]
                                                              [X]
```

- Bỏ `.field-header-e` / label Tiêu đề EN / hàng 2.
- Placeholder: `Tiêu đề (để trống nếu ẩn)`.
- Collect: `{ name, sql_type, header_v }` — không đọc `header_e` từ form.

### Mục Titles (Filter / MultiForm / …)

Mọi `title_*_e` / `titles.filter_e` … **ẩn khỏi wizard**. Chỉ nhập bản Việt (`filter_v`, `multiform_v`, …).

---

## Model / Generate

FormInput **không bắt buộc** lưu `*_e` từ UI.

Khi render XML / Detail snippet:

```js
// host
const translator = new TranslatedText();
const header_e = header_v
  ? await translator.trans_to_en(header_v)
  : '';
```

Hoặc batch toàn bộ chuỗi VN unique trước khi render (nhanh hơn từng field).

| Nguồn VN | Output EN |
|----------|-----------|
| `src_taken_header_v` | `src_taken_header_e` (derived) |
| `trace_fields[].header_v` | `header_e` trên `<header v e>` |
| `titles.*_v` | `titles.*_e` |

**Ẩn field (FIX-05):** `header_v` rỗng → field hidden; `e=""` — **không** gọi dịch.

Preset: có thể bỏ sẵn `header_e` / `*_e` trong JSON; generate tự điền.

---

## Sửa FIX liên quan

- **FIX-06:** bỏ yêu cầu giữ `header_e` trên UI; layout mục 6 = **1×3** không còn ô EN.
- **FIX-05:** quy tắc ẩn chỉ theo `header_v` rỗng; `e` luôn từ dịch hoặc `""`.

---

## Việc phải làm

1. `preview.html` / `retrieveFlow.js` / CSS: bỏ mọi input tiêu đề EN (mục 4, 6, titles); mục 6 một hàng 3 cột.
2. Host Generate (+ optional Preview): reuse `Translate.js` điền `*_e`.
3. Fallback `e=""` nếu dịch lỗi — tương thích ApplyTranslateFBO / Ctrl+Shift+V.
4. Preset / tests: assert XML có `e="Order"` (hoặc bản dịch) khi `header_v=Đơn hàng`; UI không còn field EN.
5. Spec `02` / `05`: tiêu đề wizard = VN only; EN = derived/translate.

## Done

- [ ] Mục 4: chỉ 1 ô **Tiêu đề cột đã lấy**.
- [ ] Mục 6: 1 hàng Tên \| Kiểu \| Tiêu đề; không còn Tiêu đề EN.
- [ ] Mục titles: không còn ô `*_e`.
- [ ] Generate YCNDXA: MultiGrid / Detail snippet có `e` tiếng Anh (hoặc `e=""` + vẫn chạy ApplyTranslateFBO).
- [ ] Không duplicate Google client — dùng `src/Translate/Translate.js`.
- [ ] Test pass (mock translate trong unit test nếu cần).

## Không làm

- Không nhúng Google Translate key/logic mới trong webview.
- Không bắt user gõ EN trên form.
- Không đổi phím Ctrl+Shift+V hiện có (`when: editorTextFocus` — vẫn dùng trên file XML sau Generate).
