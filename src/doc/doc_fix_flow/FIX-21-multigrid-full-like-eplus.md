# FIX-21 — MultiGrid template **đầy đủ** theo gold EPLUS (không còn stub)

## Mức: High (template MultiGrid — rewrite)

## Vấn đề

Generate CNNB `Grid/YCNDXAMultiGrid.xml` (~44 dòng) **thiếu gần hết** so với gold EPLUS `FBISP24/.../Grid/YCNDXAMultiGrid.xml` (~235 dòng).

Template hiện tại `partitioned/MultiGrid.xml.tpl` / `single/MultiGrid.xml.tpl` chỉ còn skeleton: 3–4 field qty + Finding 2 dòng + 1 dòng toggle JS → **không chạy được** FlowMulti đầy đủ (sysfilter, chon/tag, init/load, toolbar, CheckRelative…).

| Khối | Gold EPLUS | Generate / template hiện tại |
|------|------------|------------------------------|
| DOCTYPE | `Grid.ent`, `FilterInitialize`, `FilterQuery`, `Filter.Voucher.ent`, `Controller`, `CheckRelative`, `CheckRelativeQuery` | Chỉ `Identity` / `Table` / `Tag` / `FlowMultiVoucher` / `CheckRelativeParameter` |
| `<grid>` | `order="ngay_ct, so_ct, stt_rec, line_nbr"` + `type="Inquiry"` | Chỉ `type="Inquiry"` |
| `subTitle` | Có `%d1` / `%d2` | **Thiếu** |
| `<fields>` | `ngay_ct`, `so_ct`, `ma_vt`, `ten_vt%l`, `chon`, `so_luong0`, `so_luong`, `sl_ycn`, `dvt`, `ma_nt?`, hidden keys | Chỉ `so_luong0` / `so_luong` / taken / `ma_nt?` |
| `<views>` | Đủ cột tương ứng | Chỉ qty + ma_nt |
| `<commands>` | `&FlowMultiGridCommand;` | **Thiếu** |
| Finding | Split `@@queryString`, `CheckRelativeProcess`, `with(nolock)`, `&Table;`, `@idnumber`, `&FilterInitialize;` `&FilterQuery;` `&FlowMultiGridFinding;` | Chỉ 2 dòng gán `@queryFormClause` / `@queryWhereClause` |
| Declare | `&DeclareCommandFilter;` | **Thiếu** |
| `<script>` | `init$` / `load$` / `dispose$` / `ExecuteCommand` / `scatter$` / `ResponseComplete` / `toggle$` / `onClick$…Calculate` / `onChange$…InvoiceQuantity` | **1 dòng** set `so_luong0` |
| Cuối file | `&FlowMultiGridToolbar;` | **Thiếu** |

Gold path: `\\172.168.5.14\CustomerPro\FBI\EPLUS_FBI\FBISP24\App_Data\Controllers\Grid\YCNDXAMultiGrid.xml`

---

## Quyết định

### 1. Rewrite `partitioned/MultiGrid.xml.tpl` = copy cấu trúc gold EPLUS + placeholder

**Nguồn chuẩn:** toàn bộ file vàng EPLUS ~1–235 (format giữ theo FIX-20).

**Placeholder / derive (không hardcode YCNDXA):**

| Chỗ trong gold | Template |
|----------------|----------|
| `Identity "YCNDXAMultiGrid"` | `{{identity}}MultiGrid` |
| `Controller "'YCNDXAFlowMultiGrid'"` | `'{{identity}}FlowMultiGrid'` |
| `CheckRelativeParameter "'YCNDXAMultiGrid', 'Grid', 'YCNTran'"` | `'{{identity}}MultiGrid', 'Grid', '{{parent_controller}}'` |
| `Table "64"` | `{{src_ext}}` |
| `Tag "2"` | `2` (partitioned) |
| Titles / subTitle | `{{title_multigrid_v/e}}`, `{{subtitle_multigrid_v/e}}` (default VN/EN giống gold nếu UI chưa nhập) |
| `sl_ycn` field + header + JS trừ | `{{src_taken_col}}`, `{{src_taken_header_v/e}}` |
| `a.sl_ycn < a.so_luong` | `a.{{src_taken_col}} < a.{{src_qty_col}}` |
| `m.status in (''2'')` | `{{multigrid_status_clause}}` (FIX-04 / FIX-09) |
| `and trang_thai_giao_hang…` | `{{multigrid_filter_extra_sql}}` (FIX-09) |
| Field + view `ma_nt` | Chỉ khi `include_ma_nt` (FIX-08) |
| `CheckRelativeQuery` tables | `d{{src_ext}}$000000 a, m{{src_ext}}$000000 m, dmvt b` (partitioned) |

### 2. DOCTYPE bắt buộc (đủ entity)

Giống gold ~2–20:

```xml
<!DOCTYPE grid [
  <!ENTITY % GridInitialize SYSTEM "..\Include\Grid.ent">
  %GridInitialize;
  <!ENTITY FilterInitialize SYSTEM "..\Include\FilterInitialize.xml">
  <!ENTITY FilterQuery SYSTEM "..\Include\FilterQuery.xml">
  <!ENTITY % Control.Filter SYSTEM "..\Include\Filter.Voucher.ent">
  %Control.Filter;
  <!ENTITY Controller "'{{identity}}FlowMultiGrid'">
  <!ENTITY Identity "{{identity}}MultiGrid">
  <!ENTITY Table "{{src_ext}}">
  <!ENTITY Tag "2">
  <!ENTITY % FlowMultiVoucher SYSTEM "..\Include\FlowMultiVoucher.ent">
  %FlowMultiVoucher;
  <!ENTITY % CheckRelative SYSTEM "..\Include\CheckRelative.ent">
  %CheckRelative;
  <!ENTITY CheckRelativeParameter "'{{identity}}MultiGrid', 'Grid', '{{parent_controller}}'">
  <!ENTITY CheckRelativeQuery "
  select top 0 @@fieldExternal from d{{src_ext}}$000000 a, m{{src_ext}}$000000 m, dmvt b
  return">
]>
```

### 3. Fields / views — bộ chuẩn FlowMulti (partitioned)

Thứ tự như gold:

1. `ngay_ct` (m) + filter query  
2. `so_ct` (m) + hyperlink drill-down + filter  
3. `ma_vt` (a)  
4. `ten_vt%l` (b)  
5. `chon` — `&FlowMultiGridTagHeader;` + CheckBox + `onClick$FlowMulti$GridQuery$]]>&Identity;<![CDATA[Calculate`  
6. `so_luong0` — external Numeric + `onChange$…InvoiceQuantity`  
7. `so_luong` (a)  
8. `{{src_taken_col}}` (a) — header từ wizard  
9. `dvt` (a) + `handle key="[nhieu_dvt]"`  
10. `ma_nt` (m) — **nếu** `include_ma_nt`  
11. Hidden: `stt_rec` (m), `stt_rec0` (a), `line_nbr` (a), `ma_ct` (m), `ma_kh` (m)

`<views>` / `view id="Grid"` liệt kê **đủ** field trên (cùng thứ tự).

Giữ attribute gold: `dataFormatString`, `width`, `allowFilter="&GridQueryAllowFilter;"`, `<query>&InsertCommandFilter;</query>`, `aliasName`, v.v. (FIX-20).

### 4. Commands + Declare + Finding đầy đủ

```xml
  <commands>
    &FlowMultiGridCommand;
  </commands>
  <queries>
    <query event="Declare">
      <text>&DeclareCommandFilter;</text>
    </query>
    <query event="Finding">
      <text>
        … &CheckRelativeProcess;
        … Split @@queryString → @ma_dvcs, @ngay_ct1/2, @idnumber …
        … @queryFormClause = 'm]]>&Table;<![CDATA[$%Partition m with(nolock) join d]]>&Table;<![CDATA[$%Partition a with(nolock) …'
        … @queryWhereClause = ma_dvcs + status + taken < qty + filter_extra
        … if @idnumber <> '' append stt_rec
        ]]>&FilterInitialize;&FilterQuery;
        &FlowMultiGridFinding;
      </text>
    </query>
  </queries>
```

**Không** copy khối declare local rác EPLUS (`@t` / `@t1` / `@kho` table trống) vào template mặc định — không thuộc skeleton FlowMulti chuẩn.

### 5. Script đầy đủ + Toolbar

Copy skeleton JS gold ~143–231 với `&Identity;` split; chỗ trừ số lượng dùng `{{src_taken_col}}` (không hardcode `sl_ycn`):

- `init$FlowMulti$GridQuery$…` — `_alterTitle` `%d1`/`%d2`  
- `load$…` — response + command + `_$t`/`_$k`/`_$f`/`_$i`/`_$s`  
- `dispose$…`  
- `on$FlowMulti$GridQuery$ExecuteCommand` / `scatter$` / `ResponseComplete`  
- `toggle$…` / `onClick$…Calculate` / `onChange$…InvoiceQuantity` — `so_luong0 = so_luong - {{src_taken_col}}` + `addTagRow$FlowMulti$` / `removeTagRow$FlowMulti$`

Cuối file:

```xml
  &FlowMultiGridToolbar;
</grid>
```

### 6. `single/MultiGrid.xml.tpl`

Cùng độ đầy đủ (fields/commands/Finding/script/toolbar), khác:

- `Tag ""` (hoặc theo gold single nếu có)  
- Finding FROM: `{{src_master_table}} m … join {{src_detail_table}} a …` (không `m{{ext}}$%Partition`)  
- `CheckRelativeQuery` dùng bảng single tương ứng  

Khi có gold single (`zcWIMOMultiGrid`) — đối chiếu lại; trước mắt mirror partitioned + đổi FROM/Tag.

### 7. UI / model (nếu thiếu)

- `subTitle` v/e: default giống gold (`Từ ngày %d1…` / `Date from %d1…`) — có thể hardcode trong template nếu wizard chưa có ô.  
- FIX-08 / FIX-09 vẫn áp dụng trên template **đầy đủ** (không quay lại stub).

---

## Việc phải làm

1. Rewrite `partitioned/MultiGrid.xml.tpl` theo gold EPLUS + placeholder ở bảng trên.  
2. Rewrite `single/MultiGrid.xml.tpl` cùng skeleton (FROM/Tag khác).  
3. Đồng bộ `03-xml-templates.md` — mô tả MultiGrid **full**, không còn “chỉ Finding 2 dòng”.  
4. Smoke Generate YCNDXA-like: file ~200+ dòng; có `chon`, `FlowMultiGridFinding`, `init$`/`toggle$`, toolbar; Finding vẫn nhận `status` + `multigrid_filter_extra` + `src_taken_col`.  
5. (Optional) snapshot/assert: generated chứa `&FlowMultiGridCommand;`, `&FlowMultiGridFinding;`, `function init$FlowMulti$GridQuery$`.

## Done

- [ ] MultiGrid generate gần parity gold EPLUS (cấu trúc + entity + JS), chỉ khác placeholder identity/table/taken/status/extra/ma_nt.  
- [ ] Không còn file ~40 dòng chỉ qty + 2 dòng Finding.  
- [ ] partitioned + single đều đủ; FIX-08/09 vẫn đúng trên template mới.  
- [ ] Spec `03` cập nhật.

## Không làm

- Không copy declare `@t` / `@kho` rác local EPLUS vào template mặc định.  
- Không bỏ `ma_nt` conditional (FIX-08).  
- Không minify fields/commands (FIX-20).  
- Không đổi tên hàm FlowMulti chuẩn (`init$FlowMulti$GridQuery$…`).
