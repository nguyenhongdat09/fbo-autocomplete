# FIX-12 — Bỏ master / `_customerIdentity` / aggregate khỏi Transfer mặc định

## Mức: Low (sửa FIX-11 — thu hẹp skeleton)

## Quyết định user

Các đoạn sau trong `YCNDXAMultiForm.xml` **không** đưa vào template mặc định (user tự thêm sau Generate nếu cần):

| Fixture | Đoạn bỏ |
|---------|---------|
| ~116–117 | `var stt_rec_dxa = '', dxa_so = '', ma_kh = ''` |
| ~126–127 | `_customerIdentity = m` + `var o = z._getItem(row, l0)` (+ `o.row = row` nếu có) |
| ~132–134 | `dxa_so = …; stt_rec_dxa = …; ma_kh = …` |
| ~137–140 | `setItemValues('stt_rec_dxa, dxa_so, ma_kh', …)` + `setReferenceKeyFilter('ma_kh')` + `executeAggregate([z.$a.t_so_luong])` |

**Giữ** vòng `for`, `blankMemvar` / `_appendRow`, `insert$RetrieveTagRow$Items`, `setObjectWhen` (dvt/nhieu_dvt), `cancelDialog`, `_focusWhenTabChanged`.

---

## Skeleton `TransferData` sau khi bỏ (thay §4 trong FIX-11)

```js
function on${Identity}$TransferData(f, g, a) {
  var z = f.grid, w = z.get_element().parentForm,
    f1 = '{{f1}}', f2 = '{{f2}}';
  var first = true, qf = f._$queryFilterString.split(String.fromCharCode(253));
  var ma_nt = w.getItemValue('ma_nt'),
    l0 = z._getColumnOrder('ma_vt'),
    l1 = z._getColumnOrder('dvt'),
    l2 = getColumnOrderTagRow(g, 'nhieu_dvt'),
    l3 = getColumnOrderTagRow(g, 'so_luong0'),
    l4 = getColumnOrderTagRow(g, 'so_luong'),
    l8 = getColumnOrderTagRow(g, 'ma_nt');
  // KHÔNG: m = qf[1], l5/l6/l7 (so_ct/stt_rec/ma_kh) — chỉ phục vụ master đã bỏ
  var fields = '{{transfer_map_fields}}';

  for (var r = 0; r < a.length; r++) {
    var v = (ma_nt == a[r][l8]);
    var map = fields;
    if (v) map += ''; //ex 'gia_nt, gia'
    if (a[r][l3] != 0) {
      var ins = true, row = z._rowCount;
      if (first && row > 0) if (z.blankMemvar(row)) { ins = false; first = false; }
      if (ins) z._appendRow(null, true);
      row = z._rowCount;
      // KHÔNG: _customerIdentity / var o / o.row
      insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2);
      $func.setObjectWhen(z._getItem(row, l1), a[r][l2]);
      // KHÔNG: gán stt_rec_* / src_so / ma_kh
    }
  }
  // KHÔNG: setItemValues(master) / setReferenceKeyFilter / executeAggregate
  z._focusWhenTabChanged();
  f.cancelDialog();
}
```

Khi `include_ma_nt === false`: bỏ `ma_nt` / `l8` / `v` / `if (v) map…` (FIX-08). Có thể bỏ luôn `qf` nếu không còn dùng.

---

## Hệ quả FormInput / UI

| Field / hành vi | Trước (FIX-11) | Sau (FIX-12) |
|-----------------|----------------|--------------|
| `master_set_fields` trong Transfer JS | Auto `setItemValues` | **Không** generate vào Transfer mặc định |
| Mục 7 `master_set_fields` | Vẫn có thể giữ trên form cho doc / snippet Tran | Không map vào MultiForm Transfer skeleton |
| `qf[1]` / `_customerIdentity` | Có | **Bỏ** |

Comment trong SQL temp / hướng dẫn sau Generate (optional):

```text
-- Neu can set master (stt_rec_src, src_so, ma_kh) + executeAggregate:
-- copy tu fixture YCNDXAMultiForm TransferData ~116-140 roi dan tay.
```

---

## Việc phải làm

1. Cập nhật `partitioned/MultiForm.xml.tpl` (+ single) theo skeleton trên.
2. Sửa / ghi chú đè FIX-11 §4 — **không** còn `_customerIdentity`, master vars, `setItemValues`, `setReferenceKeyFilter`, `executeAggregate`.
3. Test: MultiForm **không** chứa `_customerIdentity`, `setItemValues('stt_rec`, `setReferenceKeyFilter`, `executeAggregate`; **vẫn** chứa `blankMemvar`, `_appendRow`, `insert$RetrieveTagRow$Items`.

## Done

- [ ] Preview Transfer không còn 4 nhóm đoạn user yêu cầu bỏ.
- [ ] Vẫn đủ vòng retrieve dòng (blankMemvar → append → insert → setObjectWhen → cancelDialog).
- [ ] Test pass.

## Không làm

- Không xóa `master_set_fields` khỏi wizard nếu vẫn dùng cho chỗ khác (snippet Tran) — chỉ **không** nhúng vào Transfer mặc định.
- Không xóa `f1`/`f2` / `insert$RetrieveTagRow$Items`.
