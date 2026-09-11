# 02 — Domain Model: FormInput & quy ước bảng

## Quy ước `$` (bắt buộc)

| Loại | Có `$`? | Ví dụ |
|------|---------|-------|
| **partitioned** | Có | `m64$000000`, `d64$`, `c64$000000`, `i64$`, runtime `d64$202508` |
| **single** | Không | `phsx`, `ctsx`, `isx` |
| **Đích partitioned** | Có | `dycn$`, `mycn$`, entity `dycn$$partition$current` |

**Validation webview:**
- `partitioned`: `dest_d_table`, `dest_m_table` phải kết thúc `$`; derive `d{ext}$`, `m{ext}$`, …
- `single`: cảnh báo nếu tên bảng chứa `$`
- `fsd_addFields` partitioned: arg1 = `'d64$'` (prefix có `$`), không `'d64'`

**Không nhầm** `$` trong tên proc (`fsd_FastBusiness$Voucher$...`) với tên bảng.

---

## So sánh 2 mode

| Khía cạnh | partitioned (YCNDXA) | single (zcWIMO) |
|-----------|----------------------|-----------------|
| Filter `table` | `m64$000000` | `phsx` |
| Master / detail / inquiry | `m64$` / `d64$` / `c64$000000` / `i64$` | `phsx` / `ctsx` / `isx` |
| Filter retrieve | loop `i64$YYYYMM` | `select from isx` |
| Lookup Finding arg 2–5 | `'c64$000000','m64$','i64$'` | `'isx','phsx','isx'` |
| Partition format | `'convert(char(6)...','dateadd...','000000'` | `''''''`, `'{0}'`, `''` |
| Lookup SL còn lại | `@$primeJoin` + `d64$%Partition` | 3 arg cuối: `'ctsx','z3','z3.sl_pxh < z3.so_luong'` |
| MultiGrid FROM | `m64$%Partition join d64$%Partition` | `phsx join ctsx` |
| FlowMultiGeneralTable | `c64$000000` | `phsx` |
| ENTITY Tag | `"2"` | `""` |
| fsd_addFields nguồn | `'d64$'` | `'ctsx'` |
| queryFilterString | ma_dvcs \| filterFields \| yyyymmdd \| stt_rec_ct | ma_dvcs \| ma_kh \| ngay1 \| ngay2 \| stt_rec |

---

## FormInput — field theo mode

FormInput lưu **1 object phẳng** (đơn giản serialize preset). UI **ẩn/hiện** theo `src_table_mode`. Validator bỏ qua field không thuộc mode đang chọn.

| Field | partitioned | single | Ghi chú |
|-------|:-----------:|:------:|---------|
| `src_ext`, `src_c_table` | ✓ | — | User nhập / preset |
| `src_inquiry_table`, `src_master_table`, `src_detail_table` | — | ✓ | User nhập |
| `src_d_table`, `src_m_prefix`, `src_i_prefix` | derive | — | **Không lưu FormInput** — xem § Derive |
| `lookup_prime_join` | ✓ (Advanced) | — | Textarea multi-line; preset fill **đủ** câu SQL |
| `lookup_detail_*` | — | ✓ | |
| `queryFilterString` | — | — | **Hardcode trong template** theo mode — không field FormInput |

---

## `deriveFormInput(form)` — bắt buộc trước render

Host gọi **một lần** sau validate, trước Xml/Sql renderer. **Không** persist derived fields vào preset JSON (tránh duplicate với `src_ext`).

```js
function deriveFormInput(form) {
  const out = { ...form };
  if (form.src_table_mode === 'partitioned') {
    const ext = form.src_ext;
    out.src_d_table = `d${ext}$`;
    out.src_m_prefix = `m${ext}$`;
    out.src_i_prefix = `i${ext}$`;
    out.src_m_table_general = `m${ext}$000000`;
    out.flow_multi_general_table = form.src_c_table;
    out.src_d_table_arg = out.src_d_table; // fsd_addFields
  } else {
    out.src_d_table = form.src_detail_table;
    out.src_d_table_arg = form.src_detail_table;
    out.flow_multi_general_table = form.src_master_table;
  }
  out.f1 = out.f1 || defaultF1();
  out.f2 = out.f2 || buildF2FromTrace(out.trace_fields);
  out.master_set_fields = out.master_set_fields || buildMasterSetFields(out.trace_fields);
  out.lookup_prime_join = out.lookup_prime_join || buildDefaultPrimeJoin(out); // partitioned only
  return out;
}
```

**Test bắt buộc:** `deriveFormInput.test.js` — YCNDXA → `src_d_table === 'd64$'`, zcWIMO → `src_d_table === 'ctsx'`.

---

## Cấu trúc `trace_fields` & Transfer (mục 7)

- **Trường vết (mục 6):** `{ name, sql_type, header_v, header_e }` — dùng cho `fsd_addFields` đích và snippet Detail.
- **`stt_rec_src_col` / `stt_rec0_src_col`:** lấy theo thứ tự index `trace_fields[0]?.name` (khóa nguồn) và `trace_fields[1]?.name` (dòng khóa nguồn).
- **Nguồn sự thật transfer = mục 7 (`f1`, `f2`, `master_set_fields`):**
  - `f1`: `so_luong0, so_luong, stt_rec, stt_rec0, so_ct, line_nbr`
  - `f2`: do preset điền sẵn hoặc user sửa trực tiếp (vd: `so_luong, so_luong_ban, stt_rec_dxa, stt_rec0dxa, dxa_so, dxa_ln`)
  - `master_set_fields`: do preset điền sẵn hoặc user sửa trực tiếp (vd: `stt_rec_dxa, dxa_so, ma_kh`)

---

## `queryFilterString` — hardcode template, không FormInput

Thứ tự field nối bằng `char(253)` **khác nhau theo mode**, giữ trong **MultiForm template** (không user nhập):

| Mode | Thứ tự (MultiForm `show$`) |
|------|----------------------------|
| partitioned | `ma_dvcs` \| `filterFields[0]` \| `yyyymmdd(ngay_lct)` \| `stt_rec_ct` |
| single | `ma_dvcs` \| `ma_kh` \| `ngay_ct1` \| `ngay_ct2` \| `stt_rec` |

MultiGrid `init$` parse cùng thứ tự — **phải khớp template** từng mode.

---

## `lookup_prime_join` — preset đầy đủ (partitioned)

Advanced textarea. Preset YCNDXA fill **toàn bộ** (không `...`):

```sql
 join (
      select sum({{src_taken_col}}) as {{src_taken_col}}, sum({{src_qty_col}}) as {{src_qty_col}}, stt_rec
        from d{{src_ext}}$%Partition with(nolock)
        group by stt_rec having sum({{src_taken_col}}) < sum({{src_qty_col}})
    ) d on a.stt_rec = d.stt_rec
```

User có thể thêm join master (vd. `trang_thai_giao_hang`) — tách field `lookup_prime_join_extra` nếu cần sau MVP.

---

## `use_he_so_convert`

Chỉ ảnh hưởng **SqlTemplateRenderer** / proc branch partitioned: bật → proc có `ROUND(so_luong*(he_so/...), 3)`; tắt → cập nhật thẳng `so_luong` nguồn. Không đổi XML template.

---

## Schema FormInput (JSON) — preset lưu trên disk

```json
{
  "src_table_mode": "partitioned",
  "identity": "YCNDXA",
  "dest_tran": "YCNTran",
  "src_ma_ct": "DXA",
  "src_ext": "64",
  "dest_d_table": "dycn$",
  "dest_m_table": "mycn$",
  "src_c_table": "c64$000000",
  "src_qty_col": "so_luong",
  "src_taken_col": "sl_ycn",
  "src_taken_sql_type": "numeric(19,4)",
  "src_taken_header_v": "Sl đã lấy",
  "src_taken_header_e": "Ordered Q'ty",
  "finding_status_list": "2",
  "multigrid_filter_extra": "and trang_thai_giao_hang in ('5')",
  "lookup_detail_table": "",
  "lookup_detail_alias": "",
  "lookup_detail_remain_expr": "",
  "include_ma_nt": true,
  "_note_derived": "src_d_table, src_m_prefix, src_i_prefix derive tu src_ext — khong luu JSON",
  "titles": {
    "filter_v": "Chọn đơn hàng bán",
    "filter_e": "Select Sales Order",
    "multiform_v": "Phiếu đơn hàng bán",
    "multigrid_v": "Danh sách đơn hàng bán",
    "filter_date_v": "Đơn hàng bán từ ngày",
    "filter_so_v": "Số đơn hàng bán"
  },
  "filter_none_message_v": "Không có đơn hàng bán trong nước theo điều kiện đang lọc.",
  "filter_none_message_e": "No data matching filter condition.",
  "trace_fields": [
    { "name": "stt_rec_dxa", "sql_type": "char(13)", "header_v": "", "header_e": "" },
    { "name": "stt_rec0dxa", "sql_type": "char(3)", "header_v": "", "header_e": "" },
    { "name": "dxa_so", "sql_type": "char(16)", "header_v": "Đơn hàng", "header_e": "Order" },
    { "name": "dxa_ln", "sql_type": "int", "header_v": "Dòng", "header_e": "Line" }
  ],
  "f1": "so_luong0, so_luong, stt_rec, stt_rec0, so_ct, line_nbr",
  "f2": "so_luong, so_luong_ban, stt_rec_dxa, stt_rec0dxa, dxa_so, dxa_ln",
  "master_set_fields": "stt_rec_dxa, dxa_so",
  "other_copy_field": "nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn",
  "sysfilter_rows": [
    { "id_suffix": "CurrencyCode", "name": "ma_nt", "exname": "þm.ma_nt" },
    { "id_suffix": "ItemCode", "name": "ma_vt", "exname": "þa.ma_vt" },
    { "id_suffix": "ItemName", "name": "ten_vt%2", "exname": "þb.ten_vt%2" },
    { "id_suffix": "UOM", "name": "dvt", "exname": "þa.dvt" },
    { "id_suffix": "VoucherDate", "name": "ngay_ct", "exname": "þa.ngay_ct" },
    { "id_suffix": "VoucherNumber", "name": "so_ct", "exname": "þa.so_ct" }
  ],
  "proc_name": "fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran",
  "use_he_so_convert": true,
  "add_src_qty_col": false,
  "dest_parent_date_field": "ngay_lct",
  "dest_parent_unit_field": "ma_dvcs"
}
```

### Preset zcWIMO (single) — khác biệt chính

```json
{
  "src_table_mode": "single",
  "identity": "zcWIMO",
  "dest_tran": "WITran",
  "src_ma_ct": "SX1",
  "src_inquiry_table": "isx",
  "src_master_table": "phsx",
  "src_detail_table": "ctsx",
  "src_taken_col": "sl_pnd",
  "finding_status_list": "1, 2",
  "lookup_detail_table": "ctsx",
  "lookup_detail_alias": "z3",
  "lookup_detail_remain_expr": "z3.sl_pxh < z3.so_luong",
  "trace_fields": [
    { "name": "stt_rec_sx1", "sql_type": "char(13)" },
    { "name": "stt_rec0sx1", "sql_type": "char(3)" },
    { "name": "so_lsx", "sql_type": "char(16)" },
    { "name": "ln_sx1", "sql_type": "int" }
  ],
  "f2": "so_luong, stt_rec_sx1, stt_rec0sx1, so_lsx, ln_sx1"
}
```

---

## Auto-derive rules

| Input | Output |
|-------|--------|
| `dest_ma_ct` + `src_ma_ct` | default `identity` = `{dest}{src}` (user sửa) |
| `src_ma_ct` lower | trace prefix: `dxa` → `stt_rec_dxa`, `dxa_so` |
| `src_ext` (partitioned) | `src_d_table`=`d{ext}$`, `src_m_prefix`=`m{ext}$`, Filter table=`m{ext}$000000` |
| `src_table_mode=single` | ẩn ext; hiện inquiry/master/detail; Tag=`""` |
| `trace_fields` | thứ tự index 0/1 → `stt_rec_src_col`, `stt_rec0_src_col` cho SQL snippet |
| `proc_name` | default `fsd_FastBusiness$Voucher$BeforeAfterUpdate${Dest}TranFrom${SrcShort}Tran` |

---

## Placeholder map (generator)

| Placeholder | Nguồn FormInput |
|-------------|-----------------|
| `{{identity}}` | identity |
| `{{parent_controller}}` | dest_tran |
| `{{grid_controller}}` | identity + MultiGrid |
| `{{src_ma_ct}}` | src_ma_ct |
| `{{src_ext}}` | src_ext |
| `{{dest_d_table}}` | dest_d_table |
| `{{src_d_table}}` | deriveFormInput → `src_d_table` |
| `{{src_m_prefix}}` / `{{src_i_prefix}}` | deriveFormInput (partitioned) |
| `{{flow_multi_general_table}}` | deriveFormInput |
| `{{src_taken_col}}` | src_taken_col |
| `{{src_qty_col}}` | src_qty_col |
| `{{filter_key_flow}}` | filter_key_flow |
| `{{multigrid_where_extra}}` | multigrid_where_extra |
| `{{lookup_prime_join}}` | lookup_prime_join (partitioned only) |
| `{{lookup_detail_table}}` etc. | single only |
| `{{f1}}` / `{{f2}}` | f1 / f2 |
| `{{other_copy_field}}` | other_copy_field |

Entity Include (`FlowMultiVoucher`, `CheckRelative`) — **không** placeholder; giữ nguyên trong template.
