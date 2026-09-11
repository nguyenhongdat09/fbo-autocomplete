# 04 — SQL Generator

File output: `{sqlTempFolder}/{identity}_retrieve.sql` (logic giống `ContextMenu.newSqlTemp`).

Header:

```sql
-- CHUA DEPLOY — chi tao file temp, khong chay MCP deploy
-- Identity: {{identity}} | Mode: {{src_table_mode}}
```

---

## 1. fsd_addFields

```sql
exec fsd_addFields '{{src_d_table_arg}}','{{src_taken_col}}','{{src_taken_sql_type}}'
-- partitioned: src_d_table_arg = d64$  |  single: ctsx
-- + tung field vet dest: exec fsd_addFields 'dycn$','stt_rec_dxa','char(13)'
```

---

## 2. CREATE PROC BeforeAfterUpdate

Template: chuẩn theo `fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran` (DB EPLUS FBISP24). Có khối `DROP PROCEDURE` trước khi tạo.

### Placeholder Map

| Placeholder | Mô tả / Giá trị |
|---|---|
| `{{proc_name}}` | Tên Stored Procedure (vd: `fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran`) |
| `{{stt_rec_src_col}}` | Trường vết khóa nguồn (`trace_fields[0].name`, vd: `stt_rec_dxa`) |
| `{{stt_rec0_src_col}}` | Trường vết dòng nguồn (`trace_fields[1].name`, vd: `stt_rec0dxa`) |
| `{{dest_line_qty_col}}` | Cột SL trên detail đích (`dest_line_qty_col`, default: `so_luong`) |
| `{{dest_d_table}}000000` | Bảng detail đích gốc (vd: `dycn$000000`) |
| `{{src_c_table}}` | Bảng master nguồn kỳ 000000 (vd: `c64$000000`) |
| `{{src_d_table_arg}}` | Bảng detail nguồn dạng prefix (vd: `d64$`) |
| `{{src_taken_col}}` | Cột số lượng đã lấy trên nguồn (vd: `sl_ycn`) |
| `{{#if use_he_so_convert}}` | Nếu `true` dùng `CASE WHEN a.he_so = 0 THEN 0 ELSE ROUND(b.so_luong * (b.he_so / a.he_so), 3) END`; nếu `false` dùng `b.so_luong` |

### Skeleton Proc (Partitioned)

```sql
IF OBJECT_ID(N'dbo.{{proc_name}}', N'P') IS NOT NULL
  DROP PROCEDURE dbo.{{proc_name}}
GO

CREATE PROCEDURE {{proc_name}}
	@IDNumber CHAR(13),
	@Dtable CHAR(33),
	@Mtable CHAR(33),
	@Type CHAR(1), -- 1: before, 2: after
	@UserID INT
AS
BEGIN
	DECLARE @ngay VARCHAR(6), @status CHAR(1), @q NVARCHAR(MAX)

	SELECT TOP 0 {{stt_rec_src_col}}, {{stt_rec0_src_col}}, {{dest_line_qty_col}}{{#if use_he_so_convert}}, he_so{{/if}}
		INTO #{{identity}}_1
		FROM {{dest_d_table}}000000 a

	SET @q = ' insert into #{{identity}}_1
		select a.{{stt_rec_src_col}}, a.{{stt_rec0_src_col}}, a.{{dest_line_qty_col}}{{#if use_he_so_convert}}, a.he_so{{/if}}
		from '+@Dtable+' a with(nolock)
		left join '+@Mtable+' b with(nolock) on a.stt_rec = b.stt_rec
		where a.stt_rec = '''+@IDNumber+''' '
	EXEC(@q)

	SELECT a.{{stt_rec_src_col}}, a.{{stt_rec0_src_col}}, a.{{dest_line_qty_col}}, b.ngay_ct{{#if use_he_so_convert}}, a.he_so{{/if}},
	       RTRIM(YEAR(b.ngay_ct)) + REPLACE(str(MONTH(b.ngay_ct), 2), ' ', '0') AS parti
		INTO #stt_rec_{{identity}}
		FROM #{{identity}}_1 a
		JOIN {{src_c_table}} b ON a.{{stt_rec_src_col}} = b.stt_rec

	SET @q = ''
	SELECT @q += '
		;with t as (
			select {{stt_rec_src_col}}, {{stt_rec0_src_col}},
{{#if use_he_so_convert}}
			       CASE WHEN a.he_so = 0 THEN 0 ELSE ROUND(b.{{dest_line_qty_col}} * (b.he_so / a.he_so), 3) END as {{src_taken_col}}
{{else}}
			       b.{{dest_line_qty_col}} as {{src_taken_col}}
{{/if}}
			from {{src_d_table_arg}}'+parti+' a
			join #stt_rec_{{identity}} b
			  on a.stt_rec = b.{{stt_rec_src_col}} and a.stt_rec0 = b.{{stt_rec0_src_col}}
		), t1 as (
			select {{stt_rec_src_col}}, {{stt_rec0_src_col}}, sum({{src_taken_col}}) as {{src_taken_col}}
			from t group by {{stt_rec_src_col}}, {{stt_rec0_src_col}}
		)
		update a set {{src_taken_col}} = a.{{src_taken_col}} '
		  + CASE WHEN @Type = '1' THEN '-' ELSE ' + ' END + ' b.{{src_taken_col}}
		from {{src_d_table_arg}}'+parti+' a
		join t1 b on a.stt_rec = b.{{stt_rec_src_col}} and a.stt_rec0 = b.{{stt_rec0_src_col}}
	'
	FROM #stt_rec_{{identity}}
	GROUP BY parti

	PRINT @q
	EXEC(@q)
END
GO
```

Xem file template chi tiết: [`src/Database/RetrieveFlowTemplates/BeforeAfterUpdate.sql.tpl`](../../Database/RetrieveFlowTemplates/BeforeAfterUpdate.sql.tpl).

---

## 3. sysfilterdeclares — `/* ... */`

DELETE + INSERT từ `sysfilter_rows[]`; controller = `{identity}MultiGrid`.

---

## 4. Tran / Detail — `/** ... */`

- **ENTITY VoucherBeforeUpdate / VoucherAfterUpdate / UpdatefsdSttRecRef / DeletefsdSttRecRef**:
  ```xml
  <!ENTITY VoucherBeforeUpdate "
  	exec {{proc_name}} @stt_rec, '{{dest_d_table}}$partition$previous', '{{dest_m_table}}$partition$previous', '1', @@userID
  ">
  <!ENTITY VoucherAfterUpdate "
  	exec {{proc_name}} @stt_rec, '{{dest_d_table}}$partition$current', '{{dest_m_table}}$partition$current', '2', @@userID
  ">
  <!ENTITY UpdatefsdSttRecRef "
  	delete a from fsdSttRecRef a where a.stt_rec = @stt_rec
  	insert into fsdSttRecRef (stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, stt_rec_pre, stt_rec0pre)
  		select stt_rec, stt_rec0, ma_ct, ngay_ct, so_ct, so_luong, he_so, {{stt_rec_src_col}}, {{stt_rec0_src_col}}
  			from {{dest_d_table}}$partition$current
  			where {{stt_rec_src_col}} &lt;&gt; '' and stt_rec = @stt_rec
  ">
  <!ENTITY DeletefsdSttRecRef "
  	delete a from fsdSttRecRef a join {{dest_d_table}}$partition$current b on a.stt_rec = b.stt_rec where a.stt_rec = @stt_rec
  ">
  ```
- **Vị trí dán trên `Dir/{dest_tran}.xml` (DOCTYPE, NGOÀI CDATA)**:
  - `&VoucherBeforeUpdate;`: Updating (trước `#IF partition`) + Deleting
  - `&VoucherAfterUpdate;`: Inserted, Updated
  - `&UpdatefsdSttRecRef;`: Inserted, Updated (sau khi detail đã ghi)
  - `&DeletefsdSttRecRef;`: Deleting (trước khi xóa detail)
  - *Lưu ý: `&...;` phải nằm NGOÀI `<![CDATA[...]]>` nếu không entity không expand.*

- **Detail XML Snippets (copy tay vào `Grid/{dest_tran_detail}.xml`)**:
  1. `<fields>`: sinh các trường ẩn (`width="0" hidden="true" readOnly="true"`) cho trường vết không có header, kiểu số `type="Int32" width="70" align="right"` cho int, kiểu `width="100"` cho trường có header.
  2. `<view id="Grid">`: sinh `<field name="..."/>` tương ứng theo thứ tự.

Không deploy từ extension.

