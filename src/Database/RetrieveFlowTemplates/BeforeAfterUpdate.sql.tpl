-- CHUA DEPLOY — chi tao file temp, khong chay MCP deploy
-- Mode: {{src_table_mode}} | Identity: {{identity}}

-- ========== 1. fsd_addFields ==========
exec fsd_addFields '{{src_d_table_arg}}','{{src_taken_col}}','{{src_taken_sql_type}}'
{{#each trace_fields}}
exec fsd_addFields '{{dest_d_table}}','{{name}}','{{sql_type}}'
{{/each}}

-- ========== 2. CREATE PROC ==========
IF OBJECT_ID(N'dbo.{{proc_name}}', N'P') IS NOT NULL
  DROP PROCEDURE dbo.{{proc_name}}
GO

{{#if partitioned}}
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
		update a set {{src_taken_col}} = a.{{src_taken_col}} ' + CASE WHEN @Type = '1' THEN '-' ELSE ' + ' END + ' b.{{src_taken_col}}
		from {{src_d_table_arg}}'+parti+' a
		join t1 b on a.stt_rec = b.{{stt_rec_src_col}} and a.stt_rec0 = b.{{stt_rec0_src_col}}
	'
	FROM #stt_rec_{{identity}}
	GROUP BY parti

	PRINT @q
	EXEC(@q)
END
{{else}}
CREATE PROCEDURE {{proc_name}}
	@IDNumber CHAR(13),
	@Dtable CHAR(33),
	@Mtable CHAR(33),
	@Type CHAR(1), -- 1: before, 2: after
	@UserID INT
AS
BEGIN
	DECLARE @q NVARCHAR(MAX)

	SELECT TOP 0 {{stt_rec_src_col}}, {{stt_rec0_src_col}}, {{dest_line_qty_col}}{{#if use_he_so_convert}}, he_so{{/if}}
		INTO #{{identity}}_1
		FROM {{dest_d_table_struct}} a

	SET @q = ' insert into #{{identity}}_1
		select a.{{stt_rec_src_col}}, a.{{stt_rec0_src_col}}, a.{{dest_line_qty_col}}{{#if use_he_so_convert}}, a.he_so{{/if}}
		from '+@Dtable+' a with(nolock)
		left join '+@Mtable+' b with(nolock) on a.stt_rec = b.stt_rec
		where a.stt_rec = '''+@IDNumber+''' '
	EXEC(@q)

	;with t as (
		select {{stt_rec_src_col}}, {{stt_rec0_src_col}},
{{#if use_he_so_convert}}
		       CASE WHEN a.he_so = 0 THEN 0 ELSE ROUND(b.{{dest_line_qty_col}} * (b.he_so / a.he_so), 3) END as {{src_taken_col}}
{{else}}
		       b.{{dest_line_qty_col}} as {{src_taken_col}}
{{/if}}
		from {{src_detail_table}} a
		join #{{identity}}_1 b
		  on a.stt_rec = b.{{stt_rec_src_col}} and a.stt_rec0 = b.{{stt_rec0_src_col}}
	), t1 as (
		select {{stt_rec_src_col}}, {{stt_rec0_src_col}}, sum({{src_taken_col}}) as {{src_taken_col}}
		from t group by {{stt_rec_src_col}}, {{stt_rec0_src_col}}
	)
	update a set {{src_taken_col}} = a.{{src_taken_col}} + CASE WHEN @Type = '1' THEN -b.{{src_taken_col}} ELSE b.{{src_taken_col}} END
	from {{src_detail_table}} a
	join t1 b on a.stt_rec = b.{{stt_rec_src_col}} and a.stt_rec0 = b.{{stt_rec0_src_col}}
END
{{/if}}
GO

-- ========== 3. sysfilterdeclares ==========
/*
DELETE FROM sysfilterdeclares WHERE controller = '{{identity}}MultiGrid'
{{#each sysfilter_rows}}
INSERT INTO sysfilterdeclares([controller], [id], [name], [exname], [xtable], [fieldkey], [exfieldkey], [reftable], [reffieldkey], [joinclause], [conditionalreplace])
  VALUES(N'{{../identity}}MultiGrid', N'{{../identity}}MultiGrid.{{id_suffix}}', N'{{name}}', N'{{exname}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL)
{{/each}}
*/

-- ========== 4. Tran / Detail snippets ==========
/**
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

-- Vi tri dan tren Dir/{{dest_tran}}.xml (DOCTYPE, NGOAI CDATA):
-- &VoucherBeforeUpdate;  -> Updating (truoc #IF partition) + Deleting
-- &VoucherAfterUpdate;   -> Inserted, Updated
-- &UpdatefsdSttRecRef;   -> Inserted, Updated (sau detail da ghi)
-- &DeletefsdSttRecRef;   -> Deleting (truoc khi xoa detail)
-- Luu y: &...; phai nam NGOAI <![CDATA[...]]> neu khong entity khong expand.

-- ========== Detail XML — copy tay vào Grid/{{dest_tran_detail}}.xml ==========
-- 1) Dán khối <fields> bên dưới vào trong <fields>...</fields>
-- 2) Dán khối <view> bên dưới vào trong <view id="Grid">...</view>

<!-- BEGIN Detail.fields -->
{{detail_fields_xml}}
<!-- END Detail.fields -->

<!-- BEGIN Detail.view.Grid -->
{{detail_views_xml}}
<!-- END Detail.view.Grid -->

<!-- Menu Retrieve (nếu chưa có): g.showForm('{{identity}}Filter'); -->
*/
