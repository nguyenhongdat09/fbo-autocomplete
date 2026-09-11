# FIX-15 — CREATE PROC đầy đủ theo `YCNTranFromSOTran` (không stub)

## Mức: High (SQL template)

## Vấn đề

Generate hiện ra stub rỗng:

```sql
CREATE PROCEDURE fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran
  @IDNumber CHAR(13), @Dtable CHAR(33), @Mtable CHAR(33), @Type CHAR(1), @UserID INT
AS
BEGIN
  -- Template tu YCNTranFromSOTran: temp # lay field vet + so_luong/he_so
  -- UPDATE d64$ SET sl_ycn +/- ... theo @Type
END
GO
```

User muốn **body sẵn** giống proc thật trên EPLUS FBISP24:

`dbo.fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran`

(Nguồn: DB `EPLUS_FBI_FBISP24_A`, resolve qua `YCNDXAMultiForm.xml` — **không** nằm trong file MultiForm XML.)

---

## Proc vàng (full — đã đọc từ DB)

```sql
CREATE PROCEDURE fsd_FastBusiness$Voucher$BeforeAfterUpdate$YCNTranFromSOTran
	@IDNumber CHAR(13),
	@Dtable CHAR(33),
	@Mtable CHAR(33),
	@Type CHAR(1), -- 1: before insert, 2: after insert
	@UserID INT
	--C--DATTNH
AS
BEGIN
	DECLARE @ngay VARCHAR(6), @status CHAR(1), @q NVARCHAR(MAX)
	SELECT TOP 0 stt_rec_dxa, stt_rec0dxa, so_luong, he_so
		INTO #dycn_1
			FROM dycn$000000 a

 	SET @q = ' insert into #dycn_1
					select a.stt_rec_dxa, stt_rec0dxa, a.so_luong, a.he_so
						from '+@Dtable+' a with(nolock) left join '+@Mtable+'  b with(nolock) on a.stt_rec = b.stt_rec
						where a.stt_rec = '''+@IDNumber+'''  --and b.status in ( ''2'' )
						 '
 	EXEC(@q)

	SELECT a.stt_rec_dxa, stt_rec0dxa, a.so_luong, b.ngay_ct, he_so,
	       RTRIM(YEAR(ngay_ct)) + REPLACE(str(MONTH(ngay_ct), 2), ' ', '0') AS parti
		INTO #stt_rec_YCNTranFromSOTran
			FROM #dycn_1 a JOIN c64$000000 b ON a.stt_rec_dxa = b.stt_rec

 	SET @q = ''
	SELECT @q +='

			;with t as (
				select stt_rec_dxa, stt_rec0dxa,
				       CASE WHEN a.he_so = 0 THEN 0 ELSE ROUND(b.so_luong *(b.he_so/a.he_so),3) END as sl_ycn
					 from d64$'+parti+' a
					 join #stt_rec_YCNTranFromSOTran b
					   on a.stt_rec = b.stt_rec_dxa and a.stt_rec0 = b.stt_rec0dxa
 			), t1 as (
				select stt_rec_dxa, stt_rec0dxa, sum(sl_ycn) as sl_ycn
					from t
					group by stt_rec_dxa, stt_rec0dxa
			)
			update a set sl_ycn =  a.sl_ycn ' + CASE WHEN @Type = '1' THEN '-' ELSE ' + ' END + '  b.sl_ycn
 							from d64$'+parti+' a
							join t1 b on a.stt_rec = b.stt_rec_dxa and a.stt_rec0 = b.stt_rec0dxa
 			 '
		FROM #stt_rec_YCNTranFromSOTran
	GROUP BY parti

	print @q
 	EXEC(@q)

 END
```

---

## Quyết định

1. Thay stub trong `BeforeAfterUpdate.sql.tpl` bằng **body đầy đủ** trên, có placeholder.
2. Generate ra file temp **chạy được** sau khi user đổi tên / review (vẫn **không** auto-deploy).
3. Đầu file thêm (khuyến nghị):

```sql
IF OBJECT_ID(N'dbo.{{proc_name}}', N'P') IS NOT NULL
  DROP PROCEDURE dbo.{{proc_name}}
GO
```

### Placeholder map (partitioned)

| Trong proc vàng | FormInput / derive |
|-----------------|-------------------|
| `{{proc_name}}` | `proc_name` |
| `stt_rec_dxa` | `stt_rec_src_col` (= `trace_fields[0].name`) |
| `stt_rec0dxa` | `stt_rec0_src_col` (= `trace_fields[1].name`) |
| `so_luong` (cột SL trên **detail đích**) | `dest_qty_col` từ `f2` **hoặc** hardcode `so_luong` nếu wizard không còn field — **chốt:** dùng `{{dest_line_qty_col}}` default `so_luong` (cột lượng trên `#d` đích khi lấy về) |
| `he_so` | giữ khi `use_he_so_convert`; xem nhánh dưới |
| `dycn$000000` | `{{dest_d_table}}000000` (vd. `dycn$` → `dycn$000000`) |
| `#dycn_1` | `#{{identity}}_1` hoặc `#d_dest_1` |
| `c64$000000` | `{{src_c_table}}` |
| `#stt_rec_YCNTranFromSOTran` | `#stt_rec_{{identity}}` |
| `d64$` + parti | `{{src_d_table_arg}}` + parti (`d64$`) |
| `sl_ycn` | `{{src_taken_col}}` |

### `use_he_so_convert`

| Flag | Biểu thức gán `{{src_taken_col}}` trong CTE `t` |
|------|-----------------------------------------------|
| `true` (YCNDXA) | `CASE WHEN a.he_so = 0 THEN 0 ELSE ROUND(b.so_luong*(b.he_so/a.he_so),3) END` |
| `false` | `b.so_luong` (không quy đổi he_so; temp `#` có thể bỏ cột `he_so` nếu không cần) |

Dùng `{{#if use_he_so_convert}}…{{else}}…{{/if}}` trong `.tpl`.

### Template partitioned (khung)

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
			       CASE WHEN a.he_so = 0 THEN 0 ELSE ROUND(b.{{dest_line_qty_col}}*(b.he_so/a.he_so),3) END as {{src_taken_col}}
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

> Renderer SQL hiện có `{{#if}}` / `{{else}}` — dùng đúng helper sẵn có. Nếu `dest_line_qty_col` chưa có trong derive: default `'so_luong'`.

### Mode `single`

Không có `parti` / `c64$` / `d64$`+tháng. MVP:

- Clone logic: temp từ `@Dtable`/`@Mtable` theo field vết.
- `UPDATE {{src_detail_table}}` (vd. `ctsx`) trực tiếp theo `stt_rec`/`stt_rec0` nguồn — **không** loop `GROUP BY parti`.
- Ghi chú trong template: “đối chiếu proc single trên dự án khách nếu có; skeleton tối thiểu từ partitioned bỏ parti”.

(Proc `WITranFromSX1Tran` **không** tìm thấy trên LIKSIN DB — không lấy fixture vàng single được.)

---

## Việc phải làm

1. Viết lại `BeforeAfterUpdate.sql.tpl` nhánh `{{#if partitioned}}` = body đầy đủ + placeholders trên.
2. `deriveFormInput`: đảm bảo `stt_rec_src_col`, `stt_rec0_src_col`, `dest_line_qty_col` (`so_luong`), `src_d_table_arg`, `src_c_table`, `dest_d_table`, `use_he_so_convert`.
3. Test: SQL YCNDXA chứa `INTO #stt_rec_YCNDXA` (hoặc `#stt_rec_{{identity}}`), `ROUND(`, `UPDATE a SET sl_ycn`, `JOIN c64$000000`, **không** còn comment-only stub.
4. Cập nhật `04-sql-generator.md` — dán skeleton + map placeholder; bỏ “chỉ comment”.

## Done

- [ ] Generate YCNDXA → file SQL có body proc tương đương `YCNTranFromSOTran` (đổi tên cột/table theo form).
- [ ] `use_he_so_convert=false` → không `ROUND(...he_so...)`.
- [ ] Vẫn có fsd_addFields + sysfilter + Detail snippet như cũ.
- [ ] Test `SqlTemplateRenderer` pass.

## Không làm

- Không MCP deploy / không `CREATE` lên DB khách từ extension.
- Không copy nguyên text cứng `stt_rec_dxa` / `d64$` khi form đổi identity (phải placeholder).
- Không bắt buộc tìm được proc single trên mọi dự án.
