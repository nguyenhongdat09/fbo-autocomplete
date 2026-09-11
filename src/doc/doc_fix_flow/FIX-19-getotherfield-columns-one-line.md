# FIX-19 — GetOtherField: `&FlowMultiTagRowRequest;` + cột `#d` **một hàng ngang**

## Mức: Low–Medium (template MultiForm)

## Vấn đề

### A. Preamble `#tagRow` đang **inline** (sai pattern FBO)

CNNB generate ~107–119 copy cứng parse `@k` → `#tagRow` (còn lệch size 17/14 so với entity chuẩn).

EPLUS `YCNDXAMultiForm.xml` ~149–153 đúng:

```xml
<action id="GetOtherField">
  <text>
    &FlowMultiTagRowRequest;<![CDATA[
declare @p char(6), @r nvarchar(4000), @q nvarchar(4000)
select top 0 tr.id, cast( b.nhieu_dvt as tinyint) as nhieu_dvt, a.he_so, ...
```

`&FlowMultiTagRowRequest;` nằm trong `FlowMultiVoucher.ent` — tự dùng `&FlowMultiGeneralTable;` (đã có ENTITY trong MultiForm DOCTYPE).

### B. Cột `SELECT TOP 0` đang xuống dòng

User muốn **một hàng ngang** (như dòng `insert into #d select …`).

---

## Quyết định

### 1. Bỏ toàn bộ khối inline `#tagRow`

**Xóa** khỏi template:

```sql
declare @s nvarchar(128), @l int, @size int, @i int, @delta int
select top 0 identity(...) into #tagRow from {{flow_multi_general_table}}
select @size = 17, ...
while ...
update #tagRow set p = ...
```

### 2. Đầu `<text>` GetOtherField = entity + CDATA (như EPLUS)

```xml
<action id="GetOtherField">
  <text>
    &FlowMultiTagRowRequest;<![CDATA[
declare @p char(6), @r nvarchar(4000), @q nvarchar(4000)
select top 0 tr.id, cast(b.nhieu_dvt as tinyint) as nhieu_dvt, a.he_so, rtrim(a.ma_vt) as ma_vt, rtrim(a.dvt) as dvt, a.ngay_ct, a.ma_lo as ma_lo_ban, b.lo_yn
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
]]>
  </text>
</action>
```

Lưu ý XML:

- `&FlowMultiTagRowRequest;` **ngoài** / **trước** CDATA mở (sibling expand) — giống EPLUS.
- Không bọc entity bên trong `<![CDATA[...&FlowMultiTagRowRequest;...]]>` (sẽ không expand).

### 3. Cột `#d` một hàng

`select top 0 tr.id, cast(b.nhieu_dvt as tinyint) as nhieu_dvt, a.he_so, rtrim(a.ma_vt) as ma_vt, rtrim(a.dvt) as dvt, a.ngay_ct, a.ma_lo as ma_lo_ban, b.lo_yn` — **một dòng**; cột FIX-07 (không hang_sx / giá).

### 4. DOCTYPE

Giữ:

```xml
<!ENTITY % FlowMultiVoucher SYSTEM "..\Include\FlowMultiVoucher.ent">
%FlowMultiVoucher;
<!ENTITY FlowMultiGeneralTable "{{src_c_table}}">  <!-- hoặc flow_multi_general_table -->
```

`FlowMultiTagRowRequest` cần `FlowMultiGeneralTable` — đã có.

Áp dụng `partitioned/MultiForm.xml.tpl` + `single/` nếu GetOtherField cùng pattern.

---

## Việc phải làm

1. Sửa GetOtherField trong MultiForm templates theo §2–3.
2. Test: output có `&FlowMultiTagRowRequest;` **không** còn `declare @s nvarchar(128)` / `@size = 17` inline; `select top 0` một dòng.
3. Cập nhật FIX-11 §5 nếu còn bảo “bổ sung #tagRow preamble inline” — **đè bằng entity**.

## Done

- [ ] GetOtherField bắt đầu bằng `&FlowMultiTagRowRequest;<![CDATA[`.
- [ ] Không inline parse `#tagRow`.
- [ ] `SELECT TOP 0` cột `#d` một hàng ngang.
- [ ] Vẫn có partition loop + `&OtherCopyField;` / `&FlowMultiOrderBy;`.

## Không làm

- Không copy lại body entity vào template (luôn gọi `&FlowMultiTagRowRequest;`).
- Không thêm lại hang_sx / giá vào danh sách cột.
