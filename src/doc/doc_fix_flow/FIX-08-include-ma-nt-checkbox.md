# FIX-08 — Checkbox **Có mã nt (`ma_nt`)** — mặc định bật

## Mức: Medium (UI + MultiForm JS + MultiGrid)

## Yêu cầu user

Thêm **dấu check** “có `ma_nt` không”. **Mặc định: checked.**

Khi **có** `ma_nt`:

1. **MultiForm** Transfer JS — dòng lấy cột `ma_nt` như fixture `YCNDXAMultiForm.xml` ~113:

```js
var ma_nt = w.getItemValue('ma_nt'), m = qf[1],
  l0 = z._getColumnOrder('ma_vt'),
  l1 = z._getColumnOrder('dvt'),
  l2 = getColumnOrderTagRow(g, 'nhieu_dvt'),
  l3 = getColumnOrderTagRow(g, 'so_luong0'),
  l4 = getColumnOrderTagRow(g, 'so_luong'),
  l5 = getColumnOrderTagRow(g, 'so_ct'),
  l6 = getColumnOrderTagRow(g, 'stt_rec'),
  l7 = getColumnOrderTagRow(g, 'ma_kh'),
  l8 = getColumnOrderTagRow(g, 'ma_nt');
```

2. Đổi nhánh map giá (fixture gốc `if (v) map += ', gia_nt, gia'`) thành:

```js
if (v) map += ''; //ex 'gia_nt, gia'
```

(Không auto copy `gia_nt, gia` khi cùng `ma_nt` — khớp FIX-07 đã bỏ giá khỏi GetOtherField. Comment `//ex` để user tự mở lại nếu cần.)

3. **MultiGrid** — thêm field + view như `YCNDXAMultiGrid.xml`:

```xml
<!-- <fields> -->
<field name="ma_nt" width="50" allowFilter="&GridQueryAllowFilter;" allowSorting="&GridQueryAllowSorting;" aliasName="m" readOnly="true">
  <header v="Mã nt" e="Currency"></header>
  <query>&InsertCommandFilter;</query>
</field>

<!-- <view id="Grid"> — sau dvt / trước stt_rec -->
<field name="ma_nt"/>
```

Khi **không** check: bỏ field/view `ma_nt`; Transfer JS **không** lấy `ma_nt` / `l8`; bỏ so sánh `v = (ma_nt == a[r][l8])` (hoặc `v = true` luôn / bỏ nhánh map).

---

## FormInput

| Field | Type | Default | Ghi chú |
|-------|------|---------|---------|
| `include_ma_nt` | boolean | **`true`** | Checkbox UI; preset YCNDXA + zcWIMO = `true` |

Có thể deprecate / không dùng `filter_retrieve_fields: "ma_nt"` nếu chỉ phục vụ mục đích này — thay bằng `include_ma_nt`. Nếu vẫn giữ `filter_retrieve_fields` cho Filter Inserting thì đồng bộ: `include_ma_nt` → include `ma_nt` trong retrieve fields.

---

## UI

Đặt checkbox gần mục Transfer / MultiGrid (vd. mục 7 hoặc mục 5):

```
☑ Có mã ngoại tệ ma_nt trên MultiGrid / Transfer
```

- Load form mới / Load preset: **checked**.
- Uncheck → preview MultiForm/MultiGrid cập nhật ngay (host roundtrip).

---

## Template / renderer

### MultiForm Transfer (`on$…$TransferData`)

**`include_ma_nt === true`:**

```js
var ma_nt = w.getItemValue('ma_nt'), m = qf[1],
  … l7 = getColumnOrderTagRow(g, 'ma_kh'),
  l8 = getColumnOrderTagRow(g, 'ma_nt');
…
var v = (ma_nt == a[r][l8]);
var map = fields;
if (v) map += ''; //ex 'gia_nt, gia'
```

**`include_ma_nt === false`:**

```js
var m = qf[1],
  … l7 = getColumnOrderTagRow(g, 'ma_kh');
  // không l8 / ma_nt
…
var map = fields;
// không so sánh ma_nt; không nhánh if (v) map += …
```

### MultiGrid.xml.tpl

Dùng block điều kiện template (hoặc 2 đoạn placeholder):

```
{{#if include_ma_nt}}
  <field name="ma_nt" …>…</field>
{{/if}}
```

và trong view tương tự.

Entity `&GridQueryAllowFilter;` / `&InsertCommandFilter;` giữ như fixture (nếu template chưa có entity Grid filter — dùng literal `true` / `insert into #filter…` giống file vàng, hoặc entity đã có trong FlowMulti include).

---

## Đồng bộ với FIX-07

| Hạng mục | FIX-07 | FIX-08 |
|----------|--------|--------|
| GetOtherField cột giá | Bỏ `gia_nt2` / `gia2` | — |
| `if (v) map += ', gia_nt, gia'` | — | Đổi thành `map += ''` + comment ex |
| `other_copy_field` | Không `gia_nt, gia` | Giữ |

---

## Tests

- Preset default: `include_ma_nt === true`.
- MultiGrid YCNDXA preview **có** `<field name="ma_nt"` trong fields + view.
- MultiForm JS **có** `getColumnOrderTagRow(g, 'ma_nt')` và `if (v) map += ''; //ex 'gia_nt, gia'`.
- Uncheck → MultiGrid **không** còn `ma_nt`; JS **không** còn `l8` / so sánh `ma_nt`.

## Done

- [ ] Checkbox mặc định bật trên UI + preset.
- [ ] Checked → MultiGrid field/view + Transfer JS như trên.
- [ ] `if (v) map += ''; //ex 'gia_nt, gia'` (không còn `', gia_nt, gia'`).
- [ ] Unchecked → không sinh `ma_nt`.
- [ ] Spec `02` / `03` / `05` cập nhật; test pass.

## Không làm

- Không mặc định copy `gia_nt, gia` khi cùng nt (user tự sửa comment nếu cần).
- Không bắt buộc `ma_nt` trên Filter Dir đích — chỉ MultiGrid retrieve + Transfer so sánh.
