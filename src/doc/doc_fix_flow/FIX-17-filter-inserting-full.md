# FIX-17 — Filter `Inserting` **đầy đủ** như `YCNDXAFilter.xml` (không stub)

## Mức: High (template Filter partitioned)

## Vấn đề

Generate ra stub:

```xml
<command event="Inserting">
  <text><![CDATA[
declare @keyFlow nvarchar(4000), @$none nvarchar(512)
select @keyFlow = 'status in (''2'')', @$none = case when @@language = 'v' then N'...' else N'...' end
-- PARTITIONED: loop i64$YYYYMM retrieve (xem YCNDXAFilter.xml day du)
-- Mo YCNDXAMultiForm khi tim thay stt_rec
]]></text>
</command>
```

User muốn **full** như fixture `YCNDXAFilter.xml` ~65–126 (loop `i{{ext}}$`, retrieve `c`/`m`, mở MultiForm).

---

## Fixture vàng (rút gọn cấu trúc — giữ đủ logic)

```xml
<command event="Inserting">
  <text>
    <![CDATA[
declare @fields nvarchar(512), @keyMaster nvarchar(1024), @keyFlow nvarchar(4000), @$none nvarchar(512)
select @keyMaster = '%#20$' + rtrim(@ma_kh) + '#%', @fields = 'ma_nt'
if @ma_kh = ''
  select @keyMaster = ''
select @keyFlow = 'status in (''2'', ''4'')', @$none = case when @@language = 'v' then N'...' else N'...' end
  ]]>&CheckRelativeProcess;<![CDATA[]]><!--&XMLFlowFilterCheck;-->
        <![CDATA[
IF @so_ct = ''
  goto NoneSoct
declare @vcID varchar(32), @vcNumber varchar(32), @vcFields nvarchar(512), @retrieveID char(13), @i int, @l int, @c smalldatetime, @d smalldatetime, @t varchar(128), @s nvarchar(4000), @unit varchar(128)
select @vcNumber = ltrim(rtrim(@so_ct)), @unit = @@unit
select @i = len(@vcNumber), @l = character_maximum_length from information_schema.columns where table_name = '@@table' and column_name = 'so_ct'
select @vcNumber = space(@l - @i) + @vcNumber, @c = @ngay_ct1

if @stt_rec_ct <> '' begin
  select @retrieveID = @stt_rec_ct
  goto Retrieve
end else begin
  select top 0 stt_rec into #t from i]]>&ext;<![CDATA[$000000
  while (month(@c) + year(@c)*12) <= (month(@ngay_ct2) + year(@ngay_ct2)*12) begin
    select @t = 'i]]>&ext;<![CDATA[$' + convert(char(6), @c, 112), @c = dateadd(month, 1, @c)
    if exists(select 1 from information_schema.tables where table_name = @t) begin
      set @s = 'insert into #t select top 1 stt_rec from ' + rtrim(@t)
      set @s = @s + char(13) + 'where ngay_ct between ''' + convert(char(8), @ngay_ct1, 112) + ''' and ''' + convert(char(8), @ngay_ct2, 112) + ''''
      set @s = @s + char(13) + 'and so_ct = ''' + replace(@vcNumber, '''', '''''') + ''' and ma_dvcs = ''' + replace(@unit, '''', '''''') + ''''
      if @keyFlow <> '' set @s = @s + ' and (' + @keyFlow + ')'
      if @keyMaster <> '' set @s = @s + char(13) + 'and m$ like N''' + replace(@keyMaster, '''', '''''') + ''''
       set @s = @s + char(13) + 'order by stt_rec'
      exec sp_executesql @s
    end
    if exists(select 1 from #t where (isnull(stt_rec, '') <> '')) begin
	    select @retrieveID = stt_rec from #t
	    drop table #t
      goto Retrieve
    end
  end
  drop table #t
  select 'so_ct' as field, @$none as message
  return
end

Retrieve:
select @vcID = @retrieveID, @d = ngay_ct from c]]>&ext;<![CDATA[$000000 where stt_rec = @retrieveID
select cast('' as nvarchar(512)) as fields into #r from m]]>&ext;<![CDATA[$000000
select @t = 'm]]>&ext;<![CDATA[$'+ convert(varchar(6), (select ngay_ct from c]]>&ext;<![CDATA[$000000 where stt_rec = @retrieveID), 112)
if exists(select 1 from information_schema.tables where table_name = @t) begin
  select @s = 'insert into #r select ' + @fields + ' as fields from ' + rtrim(@t) + ' where stt_rec = ''' + replace(@retrieveID, '''', '') + ''''
  exec sp_executesql @s
end
select @vcFields = fields from #r
drop table #r
NoneSoct:
select @ngay_ct1 = isnull(@d, @ngay_ct1)
select @vcID = isnull(@vcID, @stt_rec_ct)
select '' as field, '' as message, 'on$]]>&Identity;<![CDATA[Filter$Retrieve$QueryComplete(this, '''', '''', '''', '''', '']]>&Identity;<![CDATA[MultiForm'', [''' + convert(char(8), @ngay_ct1, 112) + '''], '''+@vcID+''');' as script
]]>
  </text>
</command>
```

---

## Quyết định

### 1. Thay toàn bộ stub `Inserting` trong `partitioned/Filter.xml.tpl`

Copy nguyên cấu trúc fixture trên với placeholder:

| Chỗ fixture | Template |
|-------------|----------|
| `@keyFlow = 'status in (''2'', ''4'')'` | `@keyFlow = '{{filter_key_flow}}'` (đã derive từ `finding_status_list`, escape `'` → `''`) |
| `@$none` VN/EN | `{{filter_none_message_v}}` / `{{filter_none_message_e}}` |
| `@fields = 'ma_nt'` | `{{filter_retrieve_fields}}` — default `'ma_nt'` khi `include_ma_nt`; rỗng `''` khi uncheck (hoặc bỏ lấy fields) |
| `&ext;` | ENTITY `ext` = `{{src_ext}}` (đã có) — **giữ** split CDATA `i]]>&ext;<![CDATA[$` như fixture |
| `&Identity;` | ENTITY Identity — **giữ** split mở MultiForm |
| `&CheckRelativeProcess;` | **Giữ** giữa 2 CDATA như fixture |

### 2. Escape `@keyFlow`

`deriveFormInput` / renderer phải đưa vào XML dạng:

```text
status in (''2'')     -- một status
status in (''2'', ''4'')  -- nhiều
```

(đã có `filter_key_flow` từ FIX-04 — verify test assert chuỗi trong Filter.)

### 3. `@fields` / `include_ma_nt` (FIX-08)

```js
out.filter_retrieve_fields = form.include_ma_nt
  ? (form.filter_retrieve_fields || 'ma_nt')
  : (form.filter_retrieve_fields || '');
```

Trong SQL:

```sql
select @keyMaster = '%#20$' + rtrim(@ma_kh) + '#%', @fields = '{{filter_retrieve_fields}}'
```

Nếu `@fields` rỗng: nhánh `#r` / `@vcFields` vẫn chạy (select empty) — chấp nhận; hoặc `{{#if include_ma_nt}}` bọc đoạn lấy fields từ `m{{ext}}$` (optional, MVP giữ như fixture với fields có thể `''`).

### 4. Mode `single` (`zcWIMOFilter`)

**Không** copy loop `i$` tháng. Doc riêng / template `single/Filter.xml.tpl`:

- `select top 0 stt_rec into #t from {{src_inquiry_table}}` (không while tháng).
- Retrieve từ `{{src_master_table}}` / inquiry — đối chiếu fixture zcWIMO khi implement.
- MVP ưu tiên **partitioned full** theo YCNDXA; single đủ logic “không loop” + mở MultiForm tương tự cuối lệnh.

### 5. DOCTYPE / fields Filter

Giữ ENTITY `%CheckRelative` + `CheckRelativeParameter` (đã có). Đảm bảo template có `&CheckRelativeProcess;` (từ CheckRelative.ent) — **không** tự viết lại process.

Có thể cần field `ma_kh` trên Filter nếu dùng `@keyMaster` — fixture YCNDXA Filter thường có; nếu template hiện thiếu `ma_kh` → bổ sung hidden/external theo FlowMulti include (`&FlowMultiFilterField;` nếu entity có). Agent đọc `YCNDXAFilter.xml` full fields khi implement; **không** cắt `Inserting` dù field list tối giản.

---

## Việc phải làm

1. Viết lại `partitioned/Filter.xml.tpl` `<command event="Inserting">` = full body trên + placeholder.
2. Verify `filter_key_flow` escape đúng trong XmlTemplateRenderer / derive.
3. Test: Filter YCNDXA chứa `while (month(@c)`, `i]]>&ext;`, `goto Retrieve`, `CheckRelativeProcess`, `MultiForm`, **không** còn comment `-- PARTITIONED: loop`.
4. Cập nhật `03-xml-templates.md` — Filter Inserting = full, không stub.
5. (Song song) skeleton `single/Filter.xml.tpl` tối thiểu không loop — không để comment-only.

## Done

- [ ] Generate Filter = đủ loop `i{ext}$` + Retrieve `c`/`m` + script mở MultiForm như YCNDXA ~65–126.
- [ ] `@keyFlow` theo `finding_status_list`.
- [ ] Có `&CheckRelativeProcess;` giữa CDATA.
- [ ] Test XmlTemplateRenderer / acceptance Filter.

## Không làm

- Không rút gọn lại thành 3 dòng declare.
- Không hardcode `status in (''2'', ''4'')` — luôn từ form.
- Không bỏ ENTITY split `&ext;` / `&Identity;` (phải giống FBO Expand).
