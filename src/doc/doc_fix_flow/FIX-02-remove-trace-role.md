# FIX-02 — Bỏ cột Vai trò (role) ở mục 6 Trace Fields

## Mức: Medium (UX + derive)

## Trả lời nhanh: Role **thừa trên UI** — bỏ

Cột **Vai trò (Role)** (`stt_rec_src` / `stt_rec0_src` / `src_so` / `src_ln`) hiện **chỉ phục vụ auto-fill** mục 7:

| Dùng role để… | Thực tế hiện tại |
|---------------|------------------|
| `buildF2FromTrace` | Preset / user **đã điền `f2`** ở mục 7 → nhánh `out.f2 \|\| build…` gần như không chạy |
| `buildMasterSetFields` | Tương tự — `master_set_fields` đã có sẵn |
| `stt_rec_src_col` / `stt_rec0_src_col` (SQL snippet) | Có thể lấy theo **thứ tự dòng** trace hoặc parse `f2` |
| Validator “thiếu role stt_rec_src” | Cảnh báo giả nếu user quên chọn dropdown dù tên field đã đúng |

Mục 6 vẫn **cần** (không bỏ cả section): `name`, `sql_type`, `header_v`, `header_e` → `fsd_addFields` đích + snippet `<field>` Detail.

User đúng: dropdown Role “chả để làm gì” khi mục 7 đã là nơi cấu hình transfer.

## Quyết định

1. **Xóa cột Role** khỏi bảng mục 6 (HTML + JS collect/render).
2. **Xóa property `role`** khỏi `trace_fields[]` trong FormInput / Presets.
3. Derive thay thế (không role):

```text
trace_fields[0].name  →  stt_rec_src_col   (mặc định dòng 1 = khóa nguồn)
trace_fields[1].name  →  stt_rec0_src_col  (dòng 2 = dòng khóa)
```

Fallback khi thiếu dòng: `'stt_rec_src'` / `'stt_rec0_src'` như cũ.

4. `buildF2FromTrace` / `buildMasterSetFields`:
   - Chỉ dùng khi `f2` / `master_set_fields` **rỗng**.
   - Build theo **thứ tự mảng** `trace_fields` (không tìm theo role):
     - f2 fallback: `so_luong` + `trace_fields.map(f => f.name).join(', ')`
     - master_set fallback: `[trace[0].name, trace[2].name hoặc trace[1], 'ma_kh']` — **hoặc đơn giản hơn**: không auto master nếu rỗng, để preset bắt buộc fill (khuyến nghị MVP: preset luôn fill; fallback master = `trace[0], ma_kh`).

5. Validator: bỏ check `role === 'stt_rec_src'`. Thay bằng warning nếu `trace_fields.length === 0` hoặc `!trace_fields[0].name`.

## Việc phải làm

### UI (`preview.html` + `retrieveFlow.js`)

- Bỏ `<th>Vai trò` / `<select class="field-role">`.
- `getTraceFieldsFromTable` / `renderTraceFieldsTable` / row template: chỉ `name`, `sql_type`, `header_v`, `header_e`.
- Xóa `ROLE_OPTIONS`.

### Generator

- `Presets.js`: bỏ `role` trong mọi trace object.
- `deriveFormInput.js`: đổi logic như trên; export vẫn ổn định cho test.
- `FormInputValidator.js`: bỏ warning theo role.

### Spec

- `02-domain-model.md`: xóa section “Mapping trace_fields.role → f1/f2”; ghi quy ước **thứ tự dòng** + nguồn sự thật transfer = mục 7.
- `01-requirements.md` / `05-ui-webview.md`: trace = `{ name, sql_type, header_v, header_e }`.

### Tests

- Cập nhật fixture / assert không còn `role`.
- `deriveFormInput`: `stt_rec_src_col === trace_fields[0].name`.

## Done

- [ ] Mục 6 không còn cột Role.
- [ ] Load YCNDXA: 4 dòng vết vẫn đúng tên/type/header; mục 7 f2 / master không đổi.
- [ ] SQL preview vẫn resolve đúng cột vết `stt_rec_dxa` / `stt_rec0dxa` (từ index 0/1).
- [ ] Spec + test pass.

## Không làm

- Không bắt user map lại f2 khi bỏ role — preset giữ nguyên chuỗi f2.
- Không đoán role từ tên field (`stt_rec_*`) bằng regex phức tạp — thứ tự dòng + mục 7 là đủ.
