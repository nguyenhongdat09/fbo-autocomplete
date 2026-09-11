# FIX-01 — Bỏ `dest_qty_col` khỏi mục 4 (đã có trong mục 7 Transfer)

## Mức: Low (UX trùng)

## Vấn đề

Mục **4. Cột Số lượng & Số lượng đã lấy** hiện có field **Cột SL đích (`dest_qty_col`)** (vd. `so_luong_ban`).

Giá trị này **đã nằm trong mục 7** — chuỗi `f2` (Trường đích):

```
so_luong, so_luong_ban, stt_rec_dxa, stt_rec0dxa, dxa_so, dxa_ln
```

User phải nhập / nhìn cùng một thông tin hai lần → thừa.

## Quyết định

- **Xóa hoàn toàn** input `dest_qty_col` khỏi UI mục 4.
- **Không** giữ field FormInput `dest_qty_col` (xóa khỏi preset / collectForm / applyForm).
- Nguồn sự thật cho cột SL đích = **vị trí trong `f2`** (mục 7), user sửa trực tiếp ở đó.

Mục 4 chỉ còn:

| Field | Giữ |
|-------|-----|
| `src_qty_col` | ✓ |
| `src_taken_col` | ✓ |
| `src_taken_sql_type` | ✓ |
| `src_taken_header_v` / `_e` | ✓ |
| `dest_qty_col` | ✗ **bỏ** |

## Việc phải làm

### 1. UI

- `preview.html`: xóa label + `<input id="dest_qty_col">`.
- `retrieveFlow.js`: bỏ collect / setVal / default liên quan `dest_qty_col`.

### 2. Generator / Preset

- `Presets.js`: xóa `dest_qty_col` khỏi YCNDXA + zcWIMO.
- `deriveFormInput.js`:
  - `buildF2FromTrace(trace_fields, dest_qty_col)` → đổi signature: **không** nhận `dest_qty_col`.
  - Fallback khi `f2` trống: build từ `so_luong` + tên trace theo thứ tự (xem FIX-02) — **không** nhét `so_luong_ban` từ field riêng.
  - Preset luôn set sẵn `f2` đầy đủ (đã có) → nhánh fallback ít khi chạy.

### 3. Spec

Cập nhật:

- `src/doc/retrieve-flow/02-domain-model.md` — bỏ `dest_qty_col` khỏi schema / bảng f2 mapping (dòng “1 | dest_qty_col”).
- `src/doc/retrieve-flow/05-ui-webview.md` — mục 4 không liệt kê `dest_qty_col`.

### 4. Tests

- Sửa test còn assert `dest_qty_col`.
- Preset YCNDXA: `f2` vẫn chứa `so_luong_ban`.

## Done

- [ ] Mục 4 không còn input “Cột SL đích”.
- [ ] Load YCNDXA → mục 7 `f2` vẫn có `so_luong_ban`.
- [ ] Generate / preview không lỗi thiếu `dest_qty_col`.
- [ ] Spec 02 + 05 đã đồng bộ.
- [ ] Test suite RetrieveFlow pass.

## Không làm

- Không đổi thứ tự / ý nghĩa `f1` / `f2` chuẩn FlowMulti.
- Không ẩn field bằng CSS — **xóa** khỏi HTML + model.
