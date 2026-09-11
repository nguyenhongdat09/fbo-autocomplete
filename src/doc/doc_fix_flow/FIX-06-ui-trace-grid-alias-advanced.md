# FIX-06 — UI polish: mục 6 giống mục 4 · bỏ default `z3` · làm đẹp mục 10

## Mức: Low–Medium (UX)

User đính kèm 4 ảnh. Map như sau:

| Hình | UI hiện tại | Yêu cầu |
|------|-------------|---------|
| **1** | Mục **4** — `form-grid` 2 cột (label trên, input dưới) | **Chuẩn thiết kế** — giữ / làm mẫu |
| **2** | Mục **6** Trace Fields — bảng HTML `<table>` | **Thiết kế lại giống Hình 1** (`form-grid`) |
| **3** | Mục **5** — Lookup Detail Alias = `z3` sẵn | **Bỏ value mặc định `z3`** (chỉ placeholder) |
| **4** | Mục **10** Stored Procedure & Nâng cao | **Layout lại cho gọn / đẹp** |

---

## 1. Hình 2 — Mục 6 Trace Fields giống Hình 1

### Vấn đề

Mục 6 dùng `<table>` (cột ngang, hàng dày) — lệch visual với mục 4 (`form-grid` + `form-group`).

### Quyết định

Đổi mục 6 sang **danh sách card/row** dùng cùng CSS `form-grid` như mục 4:

```
[ Section title ......................... + Thêm trường vết ]

┌─ Trace #1 ────────────────────────────────────── [X] ─┐
│  Tên trường đích     │  Kiểu SQL                      │
│  [stt_rec_dxa    ]   │  [char(13)                 ]   │
│  Tiêu đề VN          │  Tiêu đề EN                    │
│  [               ]   │  [                         ]   │
└───────────────────────────────────────────────────────┘
┌─ Trace #2 ...                                         ┐
```

Mỗi dòng = 1 `.trace-row` chứa `.form-grid` 2×2 + nút X góc phải (giống spacing mục 4).

**Giữ dữ liệu:** `name`, `sql_type`, `header_v`, `header_e` — không đổi model (đã bỏ `role` ở FIX-02).

### Việc phải làm

- `preview.html`: bỏ `<table id="traceFieldsTable">`; thay container `#traceFieldsList`.
- `retrieveFlow.js`: `renderTraceFieldsTable` → render row `form-grid`; collect vẫn đọc class `.field-name` / `.field-sql` / …
- `retrieveFlow.css`: `.trace-row` border nhẹ, gap giống `.card-section` / `.form-grid`; nút X không phá alignment 2 cột.
- Không dùng emoji trong title mục 6.

---

## 2. Hình 3 — Bỏ mặc định `z3` ở Lookup Detail Alias

### Vấn đề

```html
<input id="lookup_detail_alias" placeholder="z3" value="z3">
```

và JS: `setVal('lookup_detail_alias', form.lookup_detail_alias || 'z3')` — ô luôn đầy `z3` dù user chưa nhập.

### Quyết định

| Lớp | Hành vi |
|-----|---------|
| **UI** | `value=""` khi form trống; **chỉ** `placeholder="z3"` |
| **Preset** | Có thể để `lookup_detail_alias: ""` (hoặc không set) — Load preset cũng không ép `z3` vào ô nếu muốn user thấy trống |
| **deriveFormInput** | Nếu alias **rỗng** lúc generate → default `'z3'` **chỉ trong derived** (không ghi ngược lên form) |

Remain expr placeholder vẫn gợi ý `z3.sl_ycn < z3.so_luong` (không prefill value trừ khi preset/single có sẵn).

### Việc phải làm

- `preview.html`: bỏ `value="z3"` trên `#lookup_detail_alias`.
- `retrieveFlow.js`: `setVal(..., form.lookup_detail_alias || '')` — **không** `|| 'z3'`.
- `Presets.js`: `lookup_detail_alias: ""` (YCNDXA + zcWIMO) **hoặc** giữ `z3` chỉ khi Load preset — **chốt: preset cũng rỗng**; derive fill lúc render.
- `deriveFormInput.js`: `out.lookup_detail_alias = out.lookup_detail_alias || 'z3'`.
- Test Lookup vẫn ra `'z3'` trong XML khi user để trống.

---

## 3. Hình 4 — Thiết kế lại mục 10 Stored Procedure & Nâng cao

### Vấn đề

Layout lệch: checkbox ngang field ngày; khoảng trống lớn; title có emoji `⚙️`; nhóm field không rõ.

### Quyết định — layout mới (cùng DNA mục 4)

```
10. Stored Procedure & Nâng cao

┌ form-grid ─────────────────────────────────────────────┐
│  Tên Procedure BeforeAfterUpdate          (full-width) │
│  [fsd_FastBusiness$Voucher$BeforeAfterUpdate$...    ]  │
│                                                         │
│  ☐ Dùng chuyển đổi hệ số (use_he_so_convert) (full)    │
│                                                         │
│  Trường ngày cha              │  Trường đơn vị cha      │
│  [ngay_lct                 ]  │  [ma_dvcs            ]  │
└─────────────────────────────────────────────────────────┘
```

Quy tắc UI:

1. **Bỏ emoji** khỏi section title (tránh lệch font / CSP style).
2. `proc_name`: `form-group full-width`.
3. Checkbox `use_he_so_convert`: **một hàng riêng** `full-width` (không đứng cạnh input ngày).
4. `dest_parent_date_field` + `dest_parent_unit_field`: **cặp 2 cột** giống mục 4.
5. Khoảng cách `gap` / label / input **reuse** class hiện có — không invent skin mới.
6. Collapsible (nếu đang có): giữ được, nhưng nội dung mở mặc định khi Load preset.

Optional nhỏ: nhãn checkbox rút gọn — `Dùng chuyển đổi hệ số` + hint `(he_so)` thay vì nhét cả `use_he_so_convert` dài vào label.

### Việc phải làm

- `preview.html`: reorder DOM theo layout trên; bỏ `⚙️`.
- `retrieveFlow.css`: nếu checkbox đang lệch, thêm `.form-group.checkbox-row` (align label + input ngang, padding giống form-group).
- Không đổi tên field / logic derive.

---

## Done

- [ ] Mục 6: không còn `<table>`; mỗi trace là `form-grid` 2×2 giống mục 4; Add/Xóa vẫn hoạt động.
- [ ] Mục 5: Alias trống khi mở mới / sau clear; placeholder `z3`; Generate vẫn ra alias `z3` nếu để trống.
- [ ] Mục 10: title không emoji; proc full-width; checkbox riêng hàng; date \| unit 2 cột; nhìn gọn như mục 4.
- [ ] Load YCNDXA / Generate / Preview không regress.
- [ ] `node src/RetrieveFlow/tests/run-all.js` pass.

## Không làm

- Không đổi FormInput schema ngoài `lookup_detail_alias` default rỗng.
- Không redesign toàn wizard — chỉ mục 5 (alias), 6, 10.
- Không thêm card shadow / gradient / font mới ngoài `--vscode-*`.
