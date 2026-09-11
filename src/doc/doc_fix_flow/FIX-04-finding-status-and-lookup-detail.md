# FIX-04 — Gom status: nhập `2,3,4` → Finding arg; Lookup detail 3 tham số cuối

## Mức: Medium (model + template Lookup partitioned)

## Vấn đề thiết kế cũ (thừa / sai chỗ)

Mục **5. Điều kiện lọc & Finding Status** hiện có **3 field** trùng ý nghĩa status:

| Field cũ | Ví dụ YCNDXA | Vấn đề |
|----------|--------------|--------|
| `filter_key_flow` | `status in ('2', '4')` | User phải viết SQL thủ công |
| `multigrid_where_extra` | `m.status in ('2') and trang_thai_giao_hang in ('5')` | Trộn status + điều kiện khác; dễ lệch với Lookup |
| `lookup_finding_status` | `2` | Chỉ 1 status trong khi Filter cho phép nhiều |

Thêm nữa: partitioned đang nhét join SL còn lại + `trang_thai_giao_hang` vào **`@$primeJoin`** (sai pattern):

```sql
-- SAI (YCNDXALookup hiện tại — không generate kiểu này nữa)
select @$primeJoin += ' join (
      select sum(sl_ycn)... from d64$%Partition ...
    ) d on a.stt_rec = d.stt_rec
          join ... trang_thai_giao_hang in (''5'') '
```

**Đúng** theo FBO FlowMulti: arg **status** + **3 tham số detail cuối** trên dòng `exec Finding` (giống zcWIMO), không gom hết vào `@$primeJoin`.

---

## Quyết định (đã chốt)

### 1. Một input status duy nhất (mục 5)

Field FormInput: **`finding_status_list`**

| User nhập | Gán vào XML (arg thứ 5 trước `'0'`) |
|-----------|-------------------------------------|
| `2` | `'2'` |
| `2,3,4` | `'2, 3, 4'` |
| `1,2` | `'1, 2'` |

Vị trí trong template (cả 2 mode) — tham số sau `@ngay_ct1, @ngay_ct2, '', ''`:

```sql
@ngay_ct1, @ngay_ct2, '', '', '{{finding_status_arg}}', '0', @unit, 0, 1,
  default, default, default, default, default, @$primeJoin, @$primeFilter,
  '{{lookup_detail_table}}', '{{lookup_detail_alias}}', '{{lookup_detail_remain_expr}}'
```

**Fixture:**

- YCNDXA (`YCNDXALookup.xml` ~dòng 70): `'2'` hoặc `'2, 3, 4'` tùy user nhập.
- zcWIMO (`zcWIMOLookup.xml` ~dòng 59): user nhập `1,2` → `'1, 2'`.

**Quy tắc format (generator):**

```js
// Input: "2,3,4" hoặc "1, 2" (có/không space sau dấu phẩy đều OK)
function formatFindingStatusArg(finding_status_list) {
  const items = finding_status_list.split(',').map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return '2'; // fallback preset
  if (items.length === 1) return items[0];
  return items.join(', '); // FBO: '1, 2' — có space sau dấu phẩy
}
```

### 2. Bỏ 3 field cũ khỏi UI / FormInput

| Field | Hành vi mới |
|-------|-------------|
| `filter_key_flow` | **Xóa** — derive từ `finding_status_list` |
| `multigrid_where_extra` | **Xóa** — derive phần `m.status` từ cùng list |
| `lookup_finding_status` | **Xóa** — thay bằng `finding_status_list` |

### 3. Derive tự động từ `finding_status_list`

```js
function parseStatusList(raw) {
  return String(raw || '2').split(',').map(s => s.trim()).filter(Boolean);
}

function deriveFilterKeyFlow(list) {
  const quoted = list.map(s => `'${s}'`).join(', ');
  return `status in (${quoted})`;
}

function deriveMultigridWhereExtra(list) {
  const quoted = list.map(s => `'${s}'`).join(', ');
  return ` and m.status in (${quoted})`;
}
```

- **Filter Inserting:** `@keyFlow = '{{filter_key_flow_derived}}'` (vd. `status in ('2', '3', '4')`).
- **MultiGrid Finding:** template giữ `a.{{src_taken_col}} < a.{{src_qty_col}}` + append `{{multigrid_where_extra_derived}}` (chỉ `m.status in (...)` — **không** auto `trang_thai_giao_hang`).

Điều kiện nghiệp vụ khác (vd. `trang_thai_giao_hang in ('5')`) → user **sửa XML tay sau Generate**, không nhét vào wizard MVP.

### 4. Lookup — `@$primeJoin` mặc định rỗng

**Cả partitioned và single**, dòng đầu Finding:

```sql
select @$primeJoin += ''
```

- **Không** generate join sum SL / trang_thai vào `@$primeJoin`.
- Field `lookup_prime_join` **bỏ khỏi wizard** (hoặc chỉ Advanced post-MVP). Preset = rỗng.
- User muốn join tùy chỉnh → sửa Lookup XML sau Generate.

### 5. Lookup — 3 arg detail cuối (partitioned = single pattern)

**Partitioned** (YCNDXA) phải có **cùng 3 arg cuối** như zcWIMO, không chỉ single:

| Placeholder | Partitioned / single |
|-------------|---------------------|
| `lookup_detail_table` | **Chỉ** giá trị user nhập — **không** auto `d{{src_ext}}$%Partition` |
| `lookup_detail_alias` | **Chỉ** user nhập — **không** default `z3` khi trống |
| `lookup_detail_remain_expr` | **Chỉ** user nhập — **không** derive `z3.taken < z3.qty` |

> **FIX-13:** Ô trống → Lookup arg `'', '', ''`. Placeholder UI không phải giá trị generate. Xem [FIX-13-lookup-detail-no-silent-derive.md](./FIX-13-lookup-detail-no-silent-derive.md).

**Ví dụ** user nhập đủ (status `2`):

```sql
select @$primeJoin += ''

exec FastBusiness$App$Voucher$Finding 'DXA', 'c64$000000', 'm64$', 'i64$',
  ...
  @ngay_ct1, @ngay_ct2, '', '', '2', '0', @unit, 0, 1,
  default, default, default, default, default, @$primeJoin, @$primeFilter,
  'd64$%Partition', 'z3', 'z3.sl_ycn < z3.so_luong'
```

**Ví dụ** 3 ô Lookup Detail để trống:

```sql
  … @$primeJoin, @$primeFilter,
  '', '', ''
```

**Ví dụ zcWIMO** khi preset/user điền `1,2` + 3 detail:

```sql
  ...
  @ngay_ct1, @ngay_ct2, '', '', '1, 2', '0', @unit, 0, 1,
  default, default, default, default, default, @$primeJoin, @$primeFilter,
  'ctsx', 'z3', 'z3.sl_pxh < z3.so_luong'
```

---

## UI mục 5 (sau fix)

| Field | Hiển thị | Ghi chú |
|-------|----------|---------|
| **Trạng thái lọc (`finding_status_list`)** | ✓ mọi mode | Placeholder: `2` hoặc `1,2` hoặc `2,3,4` |
| **Lookup detail table** | ✓ | User nhập; trống → `''` (placeholder chỉ gợi ý) |
| **Lookup detail alias** | ✓ | User nhập; trống → `''` — **không** default `z3` |
| **Lookup detail remain expr** | ✓ | User nhập; trống → `''` — **không** auto derive |
| `filter_key_flow` | ✗ bỏ | Derive |
| `multigrid_where_extra` | ✗ bỏ | Derive `m.status` only |
| `lookup_finding_status` | ✗ bỏ | = `finding_status_list` formatted |
| `lookup_prime_join` | ✗ bỏ wizard | Template cứng `+= ''` |

---

## Việc phải làm

### Spec

- `02-domain-model.md`: thay 3 field status bằng `finding_status_list` + derive rules + lookup detail partitioned.
- `03-xml-templates.md`: partitioned Lookup có 3 arg cuối; `@$primeJoin` rỗng.
- `05-ui-webview.md`: mục 5 layout mới.

### Template

- `partitioned/Lookup.xml.tpl`:
  - `select @$primeJoin += ''` (xóa `{{lookup_prime_join}}`).
  - Thêm `, '{{lookup_detail_table}}', '{{lookup_detail_alias}}', '{{lookup_detail_remain_expr}}'` cuối exec.
- `single/Lookup.xml.tpl`: thêm `select @$primeJoin += ''` nếu chưa có.

### Code

- `Presets.js`: `finding_status_list: "2"` (YCNDXA), `"1,2"` (zcWIMO); bỏ 3 field cũ + `lookup_prime_join` body.
- `deriveFormInput.js`: `formatFindingStatusArg`, `deriveFilterKeyFlow`, `deriveMultigridWhereExtra`, derive lookup detail partitioned.
- `preview.html` + `retrieveFlow.js`: UI mục 5.
- `FormInputValidator.js`: validate `finding_status_list` non-empty, chỉ số/chữ cách nhau bởi dấu phẩy.

### Tests

- `XmlTemplateRenderer.test.js`:
  - YCNDXA Lookup **không** chứa `join ( select sum(sl_ycn)` trong `@$primeJoin`.
  - YCNDXA Lookup có `'d64$%Partition', 'z3', 'z3.sl_ycn < z3.so_luong'`.
  - zcWIMO có `'1, 2'` (space sau comma).
- Filter/MultiGrid assert derive `status in ('2')` / `m.status in ('2')`.

---

## Done

- [ ] Mục 5 chỉ còn 1 ô status + 3 ô lookup detail (alias/table/expr).
- [ ] Load YCNDXA → status `2`; Load zcWIMO → `1,2` → preview Lookup đúng arg.
- [ ] Partitioned Lookup **không** generate join trong `@$primeJoin`.
- [ ] Partitioned Lookup **có** 3 arg cuối giống zcWIMO.
- [ ] Filter `@keyFlow` và MultiGrid `m.status` derive từ cùng list.
- [ ] Spec + test pass.

## Không làm

- Không auto `trang_thai_giao_hang` hay join master phức tạp trong generator.
- Không giữ textarea `lookup_prime_join` mặc định có nội dung join — luôn `+= ''`.
- Không bắt user viết `status in ('...')` thủ công.
