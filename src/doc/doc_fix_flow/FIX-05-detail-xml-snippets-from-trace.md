# FIX-05 — Sinh XML Detail trong `/**/` từ Trace Fields (copy tay)

## Mức: Medium (SQL snippet)

## Vấn đề

Mục **6. Trường vết** có 4 field (vd. YCNDXA: `stt_rec_dxa`, `stt_rec0dxa`, `dxa_so`, `dxa_ln`) nhưng file SQL temp hiện **chưa sinh đủ** XML để user copy vào `{dest}Detail.xml`.

Fixture vàng `YCNDetail.xml` cần **2 chỗ** dán:

1. Trong `<fields>` — khai báo `<field …>`
2. Trong `<views>/<view id="Grid">` — `<field name="…"/>`

Template hiện chỉ có comment placeholder:

```sql
<!-- Snippet Detail field -> Grid/{{dest_tran_detail}}.xml -->
```

## Quyết định

Trong block `/** … */` của `{identity}_retrieve.sql`, sau entity Tran, generate **đủ 2 khối** từ `trace_fields[]`. User tự copy → `Grid/{dest_detail}.xml` (không auto-sửa Detail).

### Quy tắc sinh `<fields>` (theo YCNDetail)

| Điều kiện trên 1 dòng `trace_fields` | XML sinh ra |
|--------------------------------------|-------------|
| `header_v` và `header_e` đều rỗng | **Ẩn:** `width="0" hidden="true" readOnly="true"` + header rỗng |
| Có tiêu đề + `sql_type` là `int` / `Int32` | **Hiện số:** `type="Int32" width="70" align="right" readOnly="true"` + header |
| Có tiêu đề + kiểu khác | **Hiện text:** `width="100" readOnly="true"` + header |

**Ví dụ YCNDXA** (khớp `YCNDetail.xml` ~128–133 và ~155–160):

```xml
<!-- DÁN vào <fields> của Grid/YCNDetail.xml -->
<field name="stt_rec_dxa" width="0" hidden="true" readOnly="true">
	<header v="" e=""></header>
</field>
<field name="stt_rec0dxa" width="0" hidden="true" readOnly="true">
	<header v="" e=""></header>
</field>
<field name="dxa_so" width="100" readOnly="true">
	<header v="Đơn hàng" e="Order"></header>
</field>
<field name="dxa_ln" type="Int32" width="70" align="right" readOnly="true">
	<header v="Dòng" e="Line"></header>
</field>
```

### Quy tắc sinh `<views>` (theo YCNDetail ~204–205, ~211–213)

Mỗi `trace_fields[i].name` → một dòng:

```xml
<!-- DÁN vào <view id="Grid"> của Grid/YCNDetail.xml (cùng thứ tự với fields) -->
<field name="stt_rec_dxa"/>
<field name="stt_rec0dxa"/>
<field name="dxa_so"/>
<field name="dxa_ln"/>
```

### Khung trong SQL temp

```sql
/**
... entity Tran ...

-- ========== Detail XML — copy tay vào Grid/{{dest_tran_detail}}.xml ==========
-- 1) Dán khối <fields> bên dưới vào trong <fields>...</fields>
-- 2) Dán khối <view> bên dưới vào trong <view id="Grid">...</view>

<!-- BEGIN Detail.fields -->
... các <field> như trên ...
<!-- END Detail.fields -->

<!-- BEGIN Detail.view.Grid -->
... các <field name="..."/> như trên ...
<!-- END Detail.view.Grid -->

<!-- Menu Retrieve (nếu chưa có): g.showForm('{{identity}}Filter'); -->
*/
```

`dest_tran_detail` derive sẵn (vd. `YCNTran` → `YCNDetail`).

## Việc phải làm

### Generator

- `SqlTemplateRenderer` / `BeforeAfterUpdate.sql.tpl`: loop `trace_fields` sinh 2 khối XML.
- Helper khuyến nghị `buildDetailFieldXml(trace_fields)` + `buildDetailViewXml(trace_fields)` trong `deriveFormInput.js` hoặc file `detailSnippet.js` — **test unit riêng**.

### Spec

- `04-sql-generator.md`: thay mục “snippet `<field>` Detail” bằng 2 khối fields + view như trên.
- `08-acceptance-checklist.md`: assert SQL chứa `stt_rec_dxa` hidden + `dxa_so` header + `<field name="dxa_ln"/>` trong view block.

### Tests

- YCNDXA: SQL chứa 4 field declarations + 4 view refs đúng pattern.
- zcWIMO: tương tự với `stt_rec_sx1` / `so_lsx` / `ln_sx1`.

## Done

- [ ] Generate YCNDXA → SQL `/**/` có đủ fields (ẩn + hiện) khớp fixture YCNDetail.
- [ ] Cùng file có khối view Grid với 4 `<field name="…"/>`.
- [ ] Comment chỉ rõ file đích `Grid/YCNDetail.xml` và 2 vị trí dán.
- [ ] Không ghi/sửa file Detail trên disk.
- [ ] Test pass.

## Không làm

- Không auto-merge vào Detail.xml.
- Không sinh `fsd_addFields` trong block này (đã có mục SQL riêng).
- Không đoán width từ tên field ngoài quy tắc header rỗng / `int`.
