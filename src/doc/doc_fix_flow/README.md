# Retrieve Flow — docs_fix (prompt fix sau review UI)

Thư mục này chứa **prompt fix** sau review wizard Retrieve Flow Designer. Agent đọc theo thứ tự số FIX, sửa code + đồng bộ spec [`../retrieve-flow/`](../retrieve-flow/README.md), chạy Done checklist từng file.

Không viết lại feature — **chỉ fix UX / default** dưới đây.

## Thứ tự bắt buộc

| # | File | Mức | Tóm tắt |
|---|------|-----|---------|
| 0 | [README.md](./README.md) | — | File này |
| 1 | **[FIX-01-remove-dest-qty-col-section4.md](./FIX-01-remove-dest-qty-col-section4.md)** | UX | Bỏ `dest_qty_col` ở mục 4 — đã có trong f2 mục 7 |
| 2 | **[FIX-02-remove-trace-role.md](./FIX-02-remove-trace-role.md)** | UX / model | Bỏ cột **Vai trò (role)** mục 6 — thừa so với mục 7 |
| 3 | **[FIX-03-sysfilter-default-rows.md](./FIX-03-sysfilter-default-rows.md)** | Default | Mục 8: mặc định 6 dòng sysfilter chuẩn; user thêm/sửa/xóa tùy ý |
| 4 | **[FIX-04-finding-status-and-lookup-detail.md](./FIX-04-finding-status-and-lookup-detail.md)** | Model / Lookup | Gom status `2,3,4` → Finding arg; `@$primeJoin` rỗng; partitioned thêm 3 arg detail cuối |
| 5 | **[FIX-05-detail-xml-snippets-from-trace.md](./FIX-05-detail-xml-snippets-from-trace.md)** | SQL snippet | Trace fields → XML `<fields>` + `<view>` trong `/**/` để copy sang Detail |
| 6 | **[FIX-06-ui-trace-grid-alias-advanced.md](./FIX-06-ui-trace-grid-alias-advanced.md)** | UX | Mục 6 giống form-grid mục 4; bỏ default `z3`; làm đẹp mục 10 |
| 7 | **[FIX-07-multiform-getotherfield-default.md](./FIX-07-multiform-getotherfield-default.md)** | Template | GetOtherField partitioned mặc định như YCNDXA — **bỏ** hang_sx / nuoc_sx / giá |
| 8 | **[FIX-08-include-ma-nt-checkbox.md](./FIX-08-include-ma-nt-checkbox.md)** | UI / JS / Grid | Checkbox **Có ma_nt** (default ON) → MultiGrid field + Transfer JS; `map += '' //ex gia` |
| 9 | **[FIX-09-multigrid-filter-extra-input.md](./FIX-09-multigrid-filter-extra-input.md)** | UI / MultiGrid | Ô **Điều kiện lọc MultiGrid** → append `@queryWhereClause` (vd. `trang_thai_giao_hang`) |
| 10 | **[FIX-10-vn-titles-auto-translate-en.md](./FIX-10-vn-titles-auto-translate-en.md)** | UX / Translate | Chỉ nhập tiêu đề **VI**; EN qua `Translate.js` / Ctrl+Shift+V; layout mục 4+6 gọn |
| 11 | **[FIX-11-multiform-transfer-js-default.md](./FIX-11-multiform-transfer-js-default.md)** | Template JS | MultiForm skeleton đủ: show/Checking/Transfer + **blankMemvar/_appendRow** + `#tagRow` |
| 12 | **[FIX-12-omit-master-customeridentity-from-transfer.md](./FIX-12-omit-master-customeridentity-from-transfer.md)** | Template JS | **Bỏ** khỏi Transfer mặc định: master vars, `_customerIdentity`, `setItemValues`/`setReferenceKeyFilter`/`executeAggregate` |
| 13 | **[FIX-13-lookup-detail-no-silent-derive.md](./FIX-13-lookup-detail-no-silent-derive.md)** | Derive | Ô Lookup Detail trống → XML `'', '', ''` — **không** tự điền `d64$%Partition`/`z3` |
| 14 | **[FIX-14-generate-open-files-and-sql-temp.md](./FIX-14-generate-open-files-and-sql-temp.md)** | Generate UX | Mở 4 XML sau Generate; SQL temp **bắt buộc** như NewSqlTemp + mở tab |
| 15 | **[FIX-15-beforeafterupdate-full-proc-body.md](./FIX-15-beforeafterupdate-full-proc-body.md)** | SQL template | CREATE PROC **đầy đủ** theo `YCNTranFromSOTran` (EPLUS) — không stub |
| 16 | **[FIX-16-fsdsttreceref-entities-full.md](./FIX-16-fsdsttreceref-entities-full.md)** | SQL snippet | ENTITY `UpdatefsdSttRecRef` / `DeletefsdSttRecRef` **đầy đủ** như YCNTran — không `...` |
| 17 | **[FIX-17-filter-inserting-full.md](./FIX-17-filter-inserting-full.md)** | Template Filter | `Inserting` **đầy đủ** như YCNDXAFilter ~65–126 (loop `i$`, Retrieve, MultiForm) |
| 18 | **[FIX-18-multiform-commands-format.md](./FIX-18-multiform-commands-format.md)** | Format | MultiForm Showing/Loading/Closing format nhiều dòng như EPLUS (không 1 dòng) |
| 19 | **[FIX-19-getotherfield-columns-one-line.md](./FIX-19-getotherfield-columns-one-line.md)** | Format / Entity | GetOtherField: `&FlowMultiTagRowRequest;` + cột `#d` **một hàng ngang** |
| 20 | **[FIX-20-preserve-eplus-xml-format.md](./FIX-20-preserve-eplus-xml-format.md)** | Format | Giữ indent/xuống dòng theo gold EPLUS (Filter/Form/Grid/Lookup); MultiForm `fields`/`views` nhiều dòng |
| 21 | **[FIX-21-multigrid-full-like-eplus.md](./FIX-21-multigrid-full-like-eplus.md)** | Template | MultiGrid **đầy đủ** như EPLUS (~235 dòng): DOCTYPE/fields/Finding/script/toolbar — bỏ stub |
| 22 | **[FIX-22-lookup-default-fields-and-finding-lists.md](./FIX-22-lookup-default-fields-and-finding-lists.md)** | Template | Lookup: `<fields>` mặc định EPLUS + 3 arg Finding field list (`so_ct…status` / `dmttct`) |
| 23 | **[FIX-23-filter-full-like-eplus.md](./FIX-23-filter-full-like-eplus.md)** | Template | Filter **đầy đủ** EPLUS: DOCTYPE FlowFilter, views, Checking, script init/active/close/Retrieve — ngoài Inserting (FIX-17) |

## Việc tiếp theo cho Gemini

1. Làm FIX-01 → … → **FIX-23**.
2. Ưu tiên cao: **FIX-21** MultiGrid + **FIX-22** Lookup + **FIX-23** Filter full; format MultiForm **FIX-18/19/20**.
3. Generate Filter: có views + script đủ (`init$` / `Before$Loading` / `Retrieve$QueryComplete`) — **không** chỉ `active$` set 2 field.
