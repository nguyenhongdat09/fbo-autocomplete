# FIX-07 — MultiForm GetOtherField mặc định (partitioned) — bỏ hang_sx / nuoc_sx / giá

## Mức: Medium (template MultiForm)

## Nguồn

Fixture: `YCNDXAMultiForm.xml` action `GetOtherField` (~dòng 152–176).

User chốt: **mặc định giống đoạn đó**, nhưng **bỏ**:

- `b.hang_sx_sp`
- `b.nuoc_sx` / `b.nuoc_sx_sp`
- `a.gia_nt2` (alias `gia_nt`)
- `a.gia2` (alias `gia`)

User muốn thêm cột đặc thù → sửa XML sau Generate (hoặc chỉnh `other_copy_field` + GetOtherField tay).

---

## Quyết định

### 1. Template `partitioned/MultiForm.xml.tpl` — GetOtherField đầy đủ

Thay stub hiện tại (`join d{{src_ext}}$%Partition …`) bằng khối SQL chuẩn:

```sql
declare @p char(6), @r nvarchar(4000), @q nvarchar(4000)
select top 0 tr.id,
  cast(b.nhieu_dvt as tinyint) as nhieu_dvt,
  a.he_so,
  rtrim(a.ma_vt) as ma_vt,
  rtrim(a.dvt) as dvt,
  a.ngay_ct,
  a.ma_lo as ma_lo_ban,
  b.lo_yn
    ]]>&FlowMultiUserDefinedFieldsQuery;<![CDATA[
  into #d from #tagRow tr cross join d{{src_ext}}$000000 a cross join dmvt b
set @r = '
insert into #d
select tr.id, b.nhieu_dvt, a.he_so, rtrim(a.ma_vt), rtrim(a.dvt), a.ngay_ct, a.ma_lo, b.lo_yn
    ]]>&FlowMultiUserDefinedFieldsQuery;<![CDATA[
  from (select id, stt_rec, stt_rec0 from #tagRow where p = ''%Partition'') tr
    join d{{src_ext}}$%Partition a on tr.stt_rec = a.stt_rec and tr.stt_rec0 = a.stt_rec0
    left join dmvt b on a.ma_vt = b.ma_vt
'
select distinct p into #p from #tagRow
select @p = min(p) from #p
while @p is not null begin
  set @q = replace(@r, '%Partition', @p)
  exec sp_executesql @q
  select @p = min(p) from #p where p > @p
end

select '' as array$, id, ]]>&OtherCopyField;<![CDATA[ from #d a  ]]>&FlowMultiOrderBy;<![CDATA[
return
```

**Giữ nguyên** entity `&FlowMultiUserDefinedFieldsQuery;` / `&FlowMultiOrderBy;` / `&OtherCopyField;` như fixture.

### 2. `other_copy_field` mặc định (khớp cột `#d`)

| Trước (YCNDXA preset) | Sau (default) |
|-----------------------|---------------|
| `nhieu_dvt, he_so, hang_sx_sp, nuoc_sx, gia_nt, gia, lo_yn, ma_lo_ban` | `nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn` |

Cập nhật:

- `Presets.js` (YCNDXA; zcWIMO single giữ list phù hợp mode single — xem dưới)
- Placeholder UI mục 7
- Spec `02-domain-model.md`

### 3. So sánh với fixture gốc (đã bỏ)

```diff
 select top 0 tr.id, cast(b.nhieu_dvt as tinyint) as nhieu_dvt, a.he_so,
   rtrim(a.ma_vt) as ma_vt, rtrim(a.dvt) as dvt, a.ngay_ct,
-  b.hang_sx_sp, b.nuoc_sx,
-  a.gia_nt2 as gia_nt, a.gia2 as gia,
   a.ma_lo as ma_lo_ban, b.lo_yn

 insert select tr.id, b.nhieu_dvt, a.he_so, rtrim(a.ma_vt), rtrim(a.dvt), a.ngay_ct,
-  b.hang_sx_sp, b.nuoc_sx_sp, a.gia_nt2, a.gia2,
   a.ma_lo, b.lo_yn
```

### 4. Mode `single`

Không copy nguyên khối partitioned. Template `single/MultiForm.xml.tpl` giữ pattern bảng đơn (`{{src_detail_table}}`), nhưng **cột mặc định `#d` / OtherCopyField** cũng **không** gồm hang_sx / nuoc_sx / gia — cùng list cột tối thiểu nếu có GetOtherField tương đương.

---

## Việc phải làm

1. `partitioned/MultiForm.xml.tpl` — thay toàn bộ `<action id="GetOtherField">` bằng khối trên (`{{src_ext}}`).
2. Preset + UI `other_copy_field` default mới.
3. `03-xml-templates.md` — document GetOtherField partitioned đầy đủ + list cột default.
4. Test: MultiForm YCNDXA **không** chứa `hang_sx_sp` / `gia_nt2`; **có** `ma_lo_ban`, loop `%Partition`, `&OtherCopyField;`.

## Done

- [ ] Preview MultiForm YCNDXA: GetOtherField = khối mặc định (không hang_sx / nuoc_sx / giá).
- [ ] `OtherCopyField` ENTITY = `nhieu_dvt, he_so, ma_vt, dvt, ngay_ct, ma_lo_ban, lo_yn`.
- [ ] Vẫn có `&FlowMultiUserDefinedFieldsQuery;` và vòng `while @p`.
- [ ] Test pass.

## Không làm

- Không đưa hang_sx / giá vào template “optional toggle” MVP.
- Không auto-sửa MultiForm đã generate trên disk của project khách.
- Không bắt user nhập lại SQL GetOtherField trên wizard (hardcode template; chỉnh tay sau Generate nếu cần).
