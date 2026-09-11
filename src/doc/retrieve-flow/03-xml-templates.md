# 03 — XML Templates

Generator chọn folder theo `src_table_mode`:

- [`src/Database/RetrieveFlowTemplates/partitioned/`](../../Database/RetrieveFlowTemplates/partitioned/) — YCNDXA
- [`src/Database/RetrieveFlowTemplates/single/`](../../Database/RetrieveFlowTemplates/single/) — zcWIMO

> **Lưu template trong `src/Database/`** (không để trong `src/doc/`) để đóng gói VSIX không mất — whitelist trong `.vscodeignore`.

Thay toàn bộ `{{placeholder}}` bằng FormInput. **Không** sửa Include entity.

---

## Cấu trúc 4 file

| File output | Template |
|-------------|----------|
| `Filter/{identity}Filter.xml` | Filter.xml.tpl |
| `Filter/{identity}MultiForm.xml` | MultiForm.xml.tpl |
| `Grid/{identity}MultiGrid.xml` | MultiGrid.xml.tpl |
| `Lookup/{identity}Lookup.xml` | Lookup.xml.tpl |

---

## Filter.xml.tpl (Chuẩn EPLUS)

### Cấu trúc đầy đủ:
- **DOCTYPE**: `XMLFlowFilterViews`, `XMLFlowFilterCommand`, `XMLFlowFilterCheck`, `ScriptFlowFilterCss`, `ScriptFlowFilterFunction`, `Identity`, `c11`, `c12`, `c21`, `c22`, `ext` (partitioned), `%FlowMultiVoucher;`, `%CheckRelative;`, `CheckRelativeParameter`, `CheckRelativeQuery`.
- **`<fields>`**: `ngay_ct1`, `so_ct` (AutoComplete `&Identity;Lookup`), hidden fields: `stt_rec_ct`, `ngay_ct2`, `ma_dvcs`, `ma_kh`.
- **`<views>`**: `view id="Dir"` layout chuẩn 2 dòng với `[ngay_ct1], [ngay_ct2]` và `[so_ct], [stt_rec_ct], [ma_dvcs], [ma_kh]`.
- **`<commands>`**: `&XMLFlowFilterCommand;`, `<command event="Inserting">` (full body theo FIX-17), `<command event="Checking">` (`var f = this;`).
- **`<script>`**: `&ScriptFlowFilterFunction;` kèm toàn bộ JS handler (`init$`, `active$` set `ngay_ct2, ma_kh, ma_dvcs`, `close$`, `onResponseComplete`, `onActiveTabChanged`, `onRetrieve$QueryComplete`, `set$FormScript`, `show$QueryComplete`).
- **CSS**: `&ScriptFlowFilterCss;` ở cuối file.

### Khác biệt theo mode:
- **partitioned**: `ext "{{src_ext}}"`, table `m{{src_ext}}$000000`, Inserting loop tháng qua các kỳ partition `i{{src_ext}}$`.
- **single**: table `{{src_master_table}}`, Inserting truy vấn trực tiếp `{{src_inquiry_table}}` (không loop tháng).

---

## MultiGrid.xml.tpl (Chuẩn EPLUS)

### Cấu trúc đầy đủ:
- **DOCTYPE**: Include `%GridInitialize;`, `FilterInitialize`, `FilterQuery`, `%Control.Filter;`, `Controller`, `Identity`, `Table`, `Tag`, `%FlowMultiVoucher;`, `%CheckRelative;`, `CheckRelativeParameter`, `CheckRelativeQuery`.
- **`<grid>`**: `order="ngay_ct, so_ct, stt_rec, line_nbr" type="Inquiry"`.
- **Title & SubTitle**: `title` và `subTitle` hỗ trợ `%d1`, `%d2`.
- **`<fields>`**: `ngay_ct`, `so_ct` (HyperLink), `ma_vt`, `ten_vt%l`, `chon` (CheckBox + click calculate), `so_luong0` (numeric + change quantity), `so_luong`, `{{src_taken_col}}`, `dvt`, `ma_nt` (nếu `include_ma_nt`), hidden fields (`stt_rec`, `stt_rec0`, `line_nbr`, `ma_ct`, `ma_kh`).
- **`<views>`**: Khai báo đủ view cho tất cả các field trên.
- **`<commands>`**: `&FlowMultiGridCommand;`
- **`<queries>`**:
  - `Declare`: `&DeclareCommandFilter;`
  - `Finding`: Phân tích `@queryString` ra `@ma_dvcs`, `@ngay_ct1/2`, `@idnumber`, `@keyMaster`, gắn `@queryFormClause` và `@queryWhereClause` (ma_dvcs, status, taken < qty, filter_extra), gọi `&FilterInitialize;&FilterQuery;&FlowMultiGridFinding;`.
- **`<script>`**: `&FlowMultiGridScript;` kèm toàn bộ JS handler (`init$`, `load$`, `dispose$`, `onExecuteCommand`, `scatter$`, `onResponseComplete`, `toggle$`, `onClick$Calculate`, `onChange$InvoiceQuantity`).
- **Toolbar**: `&FlowMultiGridToolbar;` ở cuối thẻ `<grid>`.

---

## MultiForm.xml.tpl

### Format XML & Commands (Chuẩn EPLUS)

```xml
  <fields>
    &FlowMultiFormField;
  </fields>
  <views>
    &FlowMultiFormView;
  </views>
  <commands>
    <command event="Showing">
      <text>
        <![CDATA[
select 'show$]]>&Identity;<![CDATA[$(this);' as message
return
]]>
      </text>
    </command>

    <command event="Loading">
      <text>
        <![CDATA[
select 'active$]]>&Identity;<![CDATA[$(this);' as message
return
]]>
      </text>
    </command>
    <command event="Closing">
      <text>
        <![CDATA[
select 'close$]]>&Identity;<![CDATA[$(this);' as message
return
]]>
      </text>
    </command>
  </commands>
```

### Script & JS Skeleton

- `show${Identity}$(f)`: Build `queryFilterString` (`ma_dvcs`, `_filter$Fields[0]`, `ngay_lct`/`ngay_ct` formatted `yyyyMMdd`, `_stt_rec_ct`) rồi gọi `show$FlowMulti$Form(f, queryFilterString, ...)`.
- `active${Identity}$(f)`: Đăng ký `onResponseComplete` và gọi `active$FlowMulti$Form(f)`.
- `close${Identity}$(f)`: Gọi `close$FlowMulti$Form(f)` và gỡ `onResponseComplete`.
- `on${Identity}Form$ResponseComplete(sender, e)`:
  - `Context === 'Checking'`: Gom `f._$k` từ `g._$k` (stt_rec + char(255) + stt_rec0), gọi `f.request('GetOtherField', ...)` (partitioned gửi kèm `date`).
  - `Context === 'GetOtherField'`: Ghép kết quả vào `a[i] = g._$k[i].concat(result[i].slice(2))` rồi gọi `on${Identity}$TransferData(f, g, a)`.
- `on${Identity}$TransferData(f, g, a)`:
  - Vòng lặp Transfer dữ liệu vào lưới chi tiết đích.
  - Tái sử dụng dòng trống đầu tiên (`if (first && row > 0) if (z.blankMemvar(row)) { ins = false; first = false; }`).
  - Nếu cần thêm dòng thì gọi `z._appendRow(null, true)`.
  - Copy dữ liệu qua `insert$RetrieveTagRow$Items(g, a, r, z, row, map, f1, f2)`.
  - Đồng bộ `setObjectWhen` cho cột dvt/nhieu_dvt (`$func.setObjectWhen(z._getItem(row, l1), a[r][l2])`).
  - Gọi `z._focusWhenTabChanged()`, `f.cancelDialog()`.
  - *(Lưu ý FIX-12: Mặc định không auto-generate các đoạn set master, `_customerIdentity`, `executeAggregate` — user tự gắn sau Generate nếu cần).*

### GetOtherField SQL (dùng `&FlowMultiTagRowRequest;`)

- Khởi đầu bằng `&FlowMultiTagRowRequest;<![CDATA[`, không viết inline `#tagRow` parser.
- Khai báo `#d` dạng hàng ngang `select top 0 tr.id, cast(b.nhieu_dvt as tinyint) as nhieu_dvt, ...` và thực hiện insert dữ liệu từ các kỳ partition `d{{src_ext}}$%Partition` (hoặc `{{src_detail_table}}` trong single mode).
- Trả về `select '' as array$, id, ]]>&OtherCopyField;<![CDATA[ from #d a  ]]>&FlowMultiOrderBy;<![CDATA[\nreturn\n]]>`.

---

## Lookup.xml.tpl

### Chung (cả 2 mode)

- `select @$primeJoin += ''` (mặc định rỗng)
- Tham số status: `'{{finding_status_arg}}'`
- 3 tham số detail cuối để lọc số lượng còn lại: `'{{lookup_detail_table}}', '{{lookup_detail_alias}}', '{{lookup_detail_remain_expr}}'` (FIX-13: khi ô trống sẽ render `''`, `''`, `''`, không tự động derive ngầm).

### partitioned

```sql
select @$primeJoin += ''

exec FastBusiness$App$Voucher$Finding '{{src_ma_ct}}', '{{src_c_table}}', '{{src_m_prefix}}', '{{src_i_prefix}}',
  'ngay_ct', 'convert(char(6), {0}, 112)', 'dateadd(month, 1, {0})', '000000',
  @@refresh, @@pageIndex, @@pageCount, @@lastPage, @@lastCount, @@firstItem, @@lastItem,
  @custID, '', 'stt_rec',
  '{{lookup_output_fields}}',
  '{{lookup_select_fields}}',
  '{{lookup_from_clause}}',
  'ngay_ct, so_ct', 1, @@userID, 1,
  @ngay_ct1, @ngay_ct2, '', '', '{{finding_status_arg}}', '0', @unit, 0, 1,
  default, default, default, default, default, @$primeJoin, @$primeFilter,
  '{{lookup_detail_table}}', '{{lookup_detail_alias}}', '{{lookup_detail_remain_expr}}'
```

### single

```sql
select @$primeJoin += ''

exec FastBusiness$App$Voucher$Finding '{{src_ma_ct}}', '{{src_inquiry_table}}', '{{src_master_table}}', '{{src_inquiry_table}}',
  'ngay_ct', '''''', '{0}', '',
  @@refresh, @@pageIndex, @@pageCount, @@lastPage, @@lastCount, @@firstItem, @@lastItem,
  @custID, '', 'stt_rec',
  '{{lookup_output_fields}}',
  '{{lookup_select_fields}}',
  '{{lookup_from_clause}}',
  'so_ct', 1, @@userID, 1,
  @ngay_ct1, @ngay_ct2, '', '', '{{finding_status_arg}}', '0', @unit, 0, 1,
  default, default, default, default, default, @$primeJoin, @$primeFilter,
  '{{lookup_detail_table}}', '{{lookup_detail_alias}}', '{{lookup_detail_remain_expr}}'
```

---

## Ghi file

Resolve `controllers_root` từ workspace. Overwrite → hỏi Yes/No.
