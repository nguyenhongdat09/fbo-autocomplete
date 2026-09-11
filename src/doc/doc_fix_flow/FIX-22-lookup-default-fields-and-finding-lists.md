# FIX-22 — Lookup: cột mặc định + 3 arg Finding field list như EPLUS

## Mức: High (template Lookup)

## Vấn đề

Generate CNNB `Lookup/YCNDXALookup.xml` **không có** khối `<fields>` và Finding để **chuỗi field rỗng** — lệch gold EPLUS:

| Chỗ | Gold EPLUS | Generate CNNB / template |
|-----|------------|--------------------------|
| `<fields>` ~15–41 | `so_ct`, `stt_rec`, `ngay_ct`, `t_tien_nt2`, `ma_nt`, `status`, `u0%l` | **Thiếu hẳn** |
| Finding arg list1 | `'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,status'` | `''` |
| Finding arg list2 | `'so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,a.status,b.statusname%l u0%l'` | `''` |
| Finding FROM status | `'a left join dmttct b on a.status = b.status where b.ma_ct = ''DXA'''` | `''` |

Gold: `\\172.168.5.14\CustomerPro\FBI\EPLUS_FBI\FBISP24\App_Data\Controllers\Lookup\YCNDXALookup.xml`

Template `partitioned/Lookup.xml.tpl` đã có placeholder `{{lookup_output_fields}}` / `{{lookup_select_fields}}` / `{{lookup_from_clause}}` nhưng **default generate = rỗng** và **không render `<fields>`**.

---

## Quyết định

### 1. Thêm `<fields>` mặc định vào Lookup template (partitioned + single)

Giống EPLUS ~15–41 (format FIX-20). Header v/e có thể hardcode chuẩn FlowMulti hoặc dùng `{{…}}` nếu wizard đã có — **tối thiểu giữ đúng tên field + attribute** như gold:

```xml
  <fields>
    <field name="so_ct" align="right" allowFilter="true" allowSorting="&GridLookupAllowSorting;">
      <header v="Số đơn hàng" e="Order No."></header>
      <query>&InsertCommandFilter;</query>
    </field>
    <field name="stt_rec">
      <header v="" e=""></header>
    </field>
    <field name="ngay_ct" type="DateTime" dataFormatString="dd/MM/yyyy" allowFilter="true" allowSorting="&GridLookupAllowSorting;">
      <header v="Ngày đơn hàng" e="Order Date"></header>
      <query>&InsertCommandFilter;</query>
    </field>
    <field name="t_tien_nt2" type="Decimal" dataFormatString="### ### ### ### ### ###.00" allowFilter="true" allowSorting="&GridLookupAllowSorting;">
      <header v="Tiền hàng" e="Amount"></header>
      <query>&InsertCommandFilter;</query>
    </field>
    <field name="ma_nt" allowFilter="true" allowSorting="&GridLookupAllowSorting;">
      <header v="Mã nt" e="Currency Code"></header>
      <query>&InsertCommandFilter;</query>
    </field>
    <field name="status" allowFilter="true" allowSorting="&GridLookupAllowSorting;">
      <header v="Trạng thái" e="Status"></header>
      <query>&InsertCommandFilter;</query>
    </field>
    <field name="u0%l" allowFilter="true" allowSorting="&GridLookupAllowSorting;">
      <header v="Tên trạng thái" e="Status Name"></header>
      <query>&InsertCommandFilter;</query>
    </field>
  </fields>
```

**Không** bỏ cột khỏi default vì “đơn giản hóa” — Lookup không có cột = UI trống.

### 2. Default 3 arg Finding = khớp fields (EPLUS ~66–69)

Trong `deriveFormInput` / preset / template default (khi user không override):

| Placeholder | Default (partitioned) |
|-------------|------------------------|
| `lookup_output_fields` | `so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,status` |
| `lookup_select_fields` | `so_ct,stt_rec,ngay_ct,t_tien_nt2,ma_nt,a.status,b.statusname%l u0%l` |
| `lookup_from_clause` | `a left join dmttct b on a.status = b.status where b.ma_ct = ''{{src_ma_ct}}''` |

- `{{src_ma_ct}}` → `DXA` (YCNDXA) / ma_ct nguồn tương ứng.  
- Escape trong XML/CDATA: `''{{src_ma_ct}}''` như gold (`''DXA''`).  
- **Ba chuỗi này phải khớp** danh sách `<fields>` (trừ `u0%l` chỉ nằm ở select + fields, không ở output list — đúng gold).

Nếu wizard đã có ô Advanced cho 3 chuỗi này: **default** = bảng trên; trống lúc load = fill default, **không** generate `''`.

### 3. Bổ sung skeleton Lookup còn thiếu (cùng FIX, không để stub)

Ngoài fields + 3 arg, template Lookup vẫn thiếu so gold — làm luôn:

| Khối | Yêu cầu |
|------|---------|
| DOCTYPE | `FilterInitialize`, `Filter.Lookup.ent`, `Controller`, `CheckRelative`, `CheckRelativeParameter`, `CheckRelativeQuery "set @$primeFilter = '1 = 0'"` |
| `<lookup>` | `order="ngay_ct, so_ct, stt_rec"` (partitioned) |
| Declare | `<query event="Declare"><text>&DeclareCommandFilter;</text></query>` |
| Finding preamble | `@unit` / `@custID` + `&FilterInitialize;` `&CheckRelativeProcess;` như gold (trước `exec`) |
| `@$primeJoin` | Giữ FIX-04: `select @$primeJoin += ''` — **không** copy join `sum(sl_ycn)` local EPLUS vào default |
| 3 arg detail cuối | Giữ FIX-04 / FIX-13: `{{lookup_detail_*}}` — trống → `''` |

> Gold EPLUS Finding **không** có 3 arg detail cuối; template **vẫn** giữ 3 arg (pattern zcWIMO / FIX-04). Default field-list args vẫn lấy từ EPLUS ~66–69.

### 4. single mode

Cùng `<fields>` mặc định + cùng 3 default field-list args (FROM `dmttct` / `ma_ct` theo `{{src_ma_ct}}` nếu single cũng dùng status name). Finding signature single giữ như template hiện tại (partition args khác) nhưng **không** để 3 chuỗi field rỗng.

---

## Việc phải làm

1. `partitioned/Lookup.xml.tpl` + `single/Lookup.xml.tpl`: thêm `<fields>` EPLUS; DOCTYPE/order/Declare/preamble đủ.  
2. Default `lookup_output_fields` / `lookup_select_fields` / `lookup_from_clause` như bảng §2 (derive hoặc hardcode default trong generator).  
3. Spec `03-xml-templates.md` + preset: Lookup không còn stub.  
4. Smoke Generate YCNDXA: Lookup có 7 field; Finding chứa đúng 3 chuỗi cột; `ma_ct = ''DXA''`; vẫn có 3 arg detail cuối (có thể `''`).

## Done

- [ ] Lookup generated có `<fields>` giống EPLUS ~15–41 (đủ 7 cột).  
- [ ] Finding có 3 arg field list như EPLUS ~66–69 (ma_ct từ `src_ma_ct`).  
- [ ] Không còn `'', '', ''` thay cho 3 arg cột khi user không sửa.  
- [ ] DOCTYPE + Declare + `order` + FilterInitialize/CheckRelative đủ; FIX-04/13 detail args vẫn đúng.

## Không làm

- Không nhét lại `@$primeJoin` join `sl_ycn` / `trang_thai_giao_hang` từ EPLUS (đã tách MultiGrid filter + Lookup detail — FIX-04/09).  
- Không bỏ `t_tien_nt2` / `ma_nt` khỏi default Lookup (khác MultiGrid checkbox FIX-08).  
- Không minify fields một dòng (FIX-20).
