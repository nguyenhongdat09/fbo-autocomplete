# 05 — UI Webview

## Layout

Wizard full-height trong panel Beside. Stack MVP: **vanilla JS + CSS** (`--vscode-*`).

### Section 0 — Chế độ bảng

- Radio: **Bảng tách kỳ (`$`)** | **Bảng đơn**
- Nút preset: **Load YCNDXA** / **Load zcWIMO**
- Đổi mode → show/hide field groups (không xóa data đã nhập)

### Sections 1–12

1. Định danh: identity, dest_tran, src_ma_ct, src_ext (partitioned only)
2. Bảng đích: dest_d_table, dest_m_table (validate `$` nếu partitioned)
3. Bảng nguồn: partitioned (`src_c_table` + hiển thị read-only derive d/m/i) hoặc single (inquiry, master, detail)
4. SL: src_qty_col, src_taken_col, src_taken_sql_type, src_taken_header_v (chỉ tiêu đề tiếng Việt)
5. Lọc & Lookup Detail: finding_status_list, multigrid_filter_extra, lookup_detail_table, lookup_detail_alias, lookup_detail_remain_expr
6. Field vết: card list 3 cột ({ name, sql_type, header_v })
7. Transfer: include_ma_nt (checkbox), f1, f2, master_set_fields, other_copy_field (cho sửa)
8. sysfilterdeclares: editable table (mặc định 6 dòng chuẩn)
9. Titles / messages (chỉ tiếng Việt; tiếng Anh tự động dịch qua Translate khi Generate)
10. **Advanced:** proc_name (full-width), use_he_so_convert (checkbox riêng hàng), dest_parent_date_field, dest_parent_unit_field
11. Preview + **Generate**

---

## Validation

| Rule | Hành vi |
|------|---------|
| partitioned + dest_d_table không kết thúc `$` | Error inline |
| single + tên bảng có `$` | Warning |
| identity / dest_tran / src_ma_ct rỗng | Block Generate |
| src_taken_col rỗng | Block Generate |
| trace_fields rỗng / thiếu tên dòng đầu | Warning |
| wrong-mode fields | Bỏ qua (không validate) |

---

## Preview — **host roundtrip** (đã chốt)

Webview **không** đọc `.tpl` / filesystem. Mọi preview qua message:

1. User bấm **Refresh preview** (hoặc debounce 400ms sau sửa form)
2. Webview → `postMessage({ type: 'preview', form })`
3. Host: `validate` → `deriveFormInput` → render XML + SQL
4. Host → `postMessage({ type: 'previewResult', xml: {...}, sql: '...' })`

Lý do: generator chỉ chạy host; template nằm `src/Database/RetrieveFlowTemplates/`.

---

## Generate flow

1. User bấm **Generate**
2. `postMessage({ type: 'generate', form })`
3. Host: validate → derive → render
4. Resolve `controllers_root` (xem 06)
5. Overwrite dialog **một lần** (xem dưới)
6. Ghi file; thu `paths[]` + `errors[]`
7. `postMessage({ type: 'generated', paths, errors })` — toast; mở `.sql` nếu thành công

### Overwrite UX (đã chốt)

Trước khi ghi, nếu **bất kỳ** file đích đã tồn tại → **1 modal**:

| Nút | Hành vi |
|-----|---------|
| **Ghi đè tất cả** | Overwrite cả 4 XML (+ sql temp nếu trùng tên) |
| **Bỏ qua file có sẵn** | Chỉ ghi file chưa tồn tại |
| **Hủy** | Không ghi gì |

Không hỏi từng file riêng.

### Error handling (đã chốt)

| Tình huống | Hành vi |
|------------|---------|
| `controllers_root` không resolve được | Block generate; `error` message hướng dẫn mở file trong `App_Data/Controllers` |
| `sqlTempFolder` chưa config / không tồn tại | **Vẫn ghi 4 XML**; skip SQL; toast cảnh báo cấu hình Settings |
| Thiếu/corrupt `.tpl` | Block render; `error` nêu path template thiếu |
| Ghi 1 file fail (permission, UNC disconnect) | **Partial:** file đã ghi giữ nguyên; `generated.errors[]` liệt kê file lỗi; không rollback tự động |
| Validate fail | Không ghi; highlight field trên form |

---

## Message protocol

| type | Hướng | Payload |
|------|-------|---------|
| `ready` | webview → host | — |
| `init` | host → webview | `{ presets: { ycndxa, zcwimo } }` |
| `preview` | webview → host | `{ form }` |
| `previewResult` | host → webview | `{ xml: {}, sql: '' }` hoặc `{ error }` |
| `generate` | webview → host | `{ form }` |
| `generated` | host → webview | `{ paths: [], errors: [], skipped: [] }` |
| `error` | host → webview | `{ message }` |

Không live-sync XML editor.

---

## Post-MVP (ghi chú, không implement)

- Export/Import FormInput JSON
- Dry-run (chỉ preview + copy clipboard)
- Undo generate (xóa paths vừa tạo)
