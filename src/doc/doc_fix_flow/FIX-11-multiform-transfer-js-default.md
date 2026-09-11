# FIX-11 — MultiForm JS mặc định đầy đủ (Transfer + ResponseComplete + show)

## Mức: High (template MultiForm — thiếu skeleton)

## Vấn đề

User hỏi đúng: đoạn `blankMemvar` / `_appendRow` (YCNDXAMultiForm ~123–125) **chưa** được ghi vào doc/template mặc định.

`partitioned/MultiForm.xml.tpl` hiện **stub**:

```js
function on$…$TransferData(f, g, a) {
  var f1 = '{{f1}}', f2 = '{{f2}}';
  …
  z.executeAggregate();
  w.setItemValues(fields, a[0]);  // SAI pattern FlowMulti
}
```

Thiếu gần như **toàn bộ** vòng lặp Transfer chuẩn fixture. FIX-07 chỉ chốt GetOtherField SQL; FIX-08 chỉ chốt nhánh `ma_nt` — **chưa** chốt skeleton JS.

---

## Nguồn chuẩn

Đọc kỹ `YCNDXAMultiForm.xml` `<script>` (partitioned). zcWIMO khác vài chỗ (queryFilterString, blank check) — MVP **ưu tiên skeleton YCNDXA**; mode single note lệch ở cuối.

---

## 1. Commands — mặc định đủ 3 event

```xml
<command event="Showing">… show${Identity}$(this) …</command>
<command event="Loading">… active${Identity}$(this) …</command>
<command event="Closing">… close${Identity}$(this) …</command>
```

Template hiện **thiếu Loading / Closing**.

---

## 2. `show$` — build `queryFilterString` (partitioned)

Mặc định theo YCNDXA (placeholder field ngày cha / đơn vị từ form):

```js
function show${Identity}$(f) {
  var z = f.grid, h = z.get_element().parentForm, queryFilterString = '', c = String.fromCharCode(253);
  queryFilterString = h.getItemValue('{{dest_parent_unit_field}}'); // ma_dvcs
  queryFilterString += c + z._filter$Fields[0];
  var d = h.getItemValue('{{dest_parent_date_field}}').z; // ngay_lct
  queryFilterString += c + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  queryFilterString += c + z._stt_rec_ct;
  show$FlowMulti$Form(f, queryFilterString,
    '${Identity}DataGridPanel', '{{parent_controller}}', '{{identity}}MultiGrid',
    '{{other_copy_field}}');
}
```

---

## 3. `active$` / `close$` / `ResponseComplete` — mặc định cứng

```js
function active${Identity}$(f) {
  f.add_onResponseComplete(on${Identity}Form$ResponseComplete);
  active$FlowMulti$Form(f);
}
function close${Identity}$(f) {
  close$FlowMulti$Form(f);
  try { f.remove_onResponseComplete(on${Identity}Form$ResponseComplete); } catch (ex) {}
}

function on${Identity}Form$ResponseComplete(sender, e) {
  var f = e.object, context = e.type.Context, result = e.type.Result;
  switch (context) {
    case 'Checking':
      var g = getGrid$FlowMulti$(f);
      var z = f.grid, h = z.get_element().parentForm;
      var d = h.getItemValue('{{dest_parent_date_field}}').z;
      var c = String.fromCharCode(255),
        k1 = g._getColumnOrder('stt_rec') - 1,
        k2 = g._getColumnOrder('stt_rec0') - 1;
      f._$k = '';
      for (var i = 0; i < g._$k.length; i++) {
        f._$k += (f._$k != '' ? ',' : '') + g._$k[i][k1] + c + g._$k[i][k2];
      }
      if (f._$k == '') f.grid._formScript = 'show$FlowMulti$RetrieveGrid(this)';
      else {
        f._checked = false;
        f.request('GetOtherField', 'GetOtherField', [
          ['k', 'Infinite', f._$k],
          ['date', 'String', d.format('yyyyMMdd')]
        ]);
      }
      break;
    case 'GetOtherField':
      var g = getGrid$FlowMulti$(f), a = [];
      for (var i = 0; i < result.length; i++) {
        a[i] = g._$k[i].concat(result[i].slice(2));
      }
      on${Identity}$TransferData(f, g, a);
      break;
    default:
      break;
  }
}
```

**Mặc định có** `['date', …]` (partitioned). Mode single (zcWIMO) có thể chỉ `[['k','Infinite',f._$k]]` — template single bỏ arg date.

---

## 4. `TransferData` — **bắt buộc** có khối blankMemvar / appendRow

Đây là đoạn user chỉ (~123–125) — **luôn** nằm trong template mặc định:

```js
if (a[r][l3] != 0) {
  var ins = true, row = z._rowCount;
  if (first && row > 0) if (z.blankMemvar(row)) { ins = false; first = false; }
  if (ins) z._appendRow(null, true);
  row = z._rowCount;
  insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);
  $func.setObjectWhen(z._getItem(row, l1), a[r][l2]);
}
```

Ý nghĩa: dòng Detail đích đang trống → **reuse** dòng đó thay vì append thêm (tránh dòng trắng).

> **FIX-12:** **Không** mặc định `_customerIdentity`, `var o`/`o.row`, biến master `stt_rec_*`/`src_so`/`ma_kh`, `setItemValues` master, `setReferenceKeyFilter`, `executeAggregate`. Xem [FIX-12](./FIX-12-omit-master-customeridentity-from-transfer.md).

### Skeleton `TransferData` đầy đủ (partitioned + `include_ma_nt`) — sau FIX-12

```js
function on${Identity}$TransferData(f, g, a) {
  var z = f.grid, w = z.get_element().parentForm,
    f1 = '{{f1}}', f2 = '{{f2}}';
  var first = true;
  var ma_nt = w.getItemValue('ma_nt'),
    l0 = z._getColumnOrder('ma_vt'),
    l1 = z._getColumnOrder('dvt'),
    l2 = getColumnOrderTagRow(g, 'nhieu_dvt'),
    l3 = getColumnOrderTagRow(g, 'so_luong0'),
    l4 = getColumnOrderTagRow(g, 'so_luong'),
    l8 = getColumnOrderTagRow(g, 'ma_nt');
  var fields = '{{transfer_map_fields}}';

  for (var r = 0; r < a.length; r++) {
    var v = (ma_nt == a[r][l8]);
    var map = fields;
    if (v) map += ''; //ex 'gia_nt, gia'   — FIX-08
    if (a[r][l3] != 0) {
      var ins = true, row = z._rowCount;
      if (first && row > 0) if (z.blankMemvar(row)) { ins = false; first = false; }
      if (ins) z._appendRow(null, true);
      row = z._rowCount;
      insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);
      $func.setObjectWhen(z._getItem(row, l1), a[r][l2]);
    }
  }
  z._focusWhenTabChanged();
  f.cancelDialog();
}
```

Khi **`include_ma_nt === false`**: bỏ `ma_nt` / `l8` / `v` / `if (v) map…` (xem FIX-08).

### `transfer_map_fields` mặc định (khớp FIX-07 — không hang_sx / giá)

```
ma_vt, ten_vt%l, dvt, he_so, ma_lo_ban, lo_yn
```

Có thể nối thêm UDF qua entity; **không** hardcode `hang_sx_sp, nuoc_sx, gia_nt, gia` như fixture gốc.

---

## 5. GetOtherField — thêm preamble `#tagRow` (đừng cắt giữa chừng)

Fixture có khối parse `@k` → `#tagRow` **trước** vòng `#d`. Template hiện bắt đầu từ `declare @p` / `#d` — **thiếu**. Bổ sung mặc định (partitioned):

```sql
declare @s nvarchar(128), @l int, @size int, @i int, @delta int
select top 0 identity(int, 1, 1) as id, stt_rec, cast('' as char(3)) as stt_rec0, cast('' as char(6)) as p
  into #tagRow from {{flow_multi_general_table}}  -- c64$000000 / …
-- … loop parse @k → insert #tagRow (copy nguyên fixture) …
update #tagRow set p = convert(char(6), b.ngay_ct, 112)
  from #tagRow a join {{flow_multi_general_table}} b on b.stt_rec = a.stt_rec

-- rồi mới khối #d + while partition (FIX-07)
```

---

## 6. Mode single — lệch cần ghi chú (không copy mù YCNDXA)

| Chỗ | zcWIMO |
|-----|--------|
| blank row | Thường check `ma_vt == ''` thay `blankMemvar` (comment sẵn trong fixture) |
| Checking request | Có thể **không** gửi `date` |
| show$ queryFilter | Thêm `ma_kh`, `ngay_ct`, `_filter$Fields[1]`… |

MVP: partitioned = skeleton trên; single = cùng vòng appendRow + `insert$RetrieveTagRow$Items`, chỉnh queryFilter / blank check theo template `single/`.

---

## Việc phải làm

1. Viết lại `<script>` + 3 commands trong `partitioned/MultiForm.xml.tpl` (và `single/` tương ứng) theo §2–4.
2. Bổ sung `#tagRow` preamble vào GetOtherField (§5).
3. Field FormInput `transfer_map_fields` (hoặc hardcode default trong template + cho sửa mục 7).
4. Test: MultiForm preview chứa `blankMemvar`, `_appendRow`, `insert$RetrieveTagRow$Items`, `setReferenceKeyFilter`, `cancelDialog`; **không** còn `setItemValues(fields, a[0])` stub.
5. Cập nhật `03-xml-templates.md` — section MultiForm JS đầy đủ.

## Done

- [ ] Generate YCNDXA MultiForm: có đủ show/active/close/ResponseComplete/TransferData.
- [ ] Trong TransferData có đúng 3 dòng blankMemvar / appendRow như fixture.
- [ ] GetOtherField có `#tagRow` + `#d` (FIX-07).
- [ ] `include_ma_nt` vẫn điều khiển l8 / map (FIX-08).
- [ ] Test pass.

## Không làm

- Không copy nguyên `fields` fixture có hang_sx / gia vào default map.
- Không bỏ `blankMemvar` vì “zcWIMO dùng cách khác” — partitioned giữ blankMemvar; single dùng variant riêng.
- Không để TransferData chỉ `setItemValues` một lần như stub cũ.
