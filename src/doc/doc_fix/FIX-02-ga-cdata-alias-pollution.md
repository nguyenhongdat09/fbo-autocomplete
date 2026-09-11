# FIX-02 — Alias `g.$a` bị nhiễm `]]>` / `<![CDATA[` (entity xen CDATA)

## Mức: BLOCKER

## Hiện tượng (đã reproduce trên DHNDetail)

Sau `extractGaDeclaration`, trong khối `g.$a` có đoạn:

```text
'[tienmt]:=[tien2]',

]]>t_tien_giam_nt: ['t_tien_giam_nt', '[tien_nt2]', '[loai] == "90"'],...
```

→ `buildFormulaMap` tạo alias **`]]>t_tien_giam_nt`** (sai).

Xuất hiện trong `entries` và `aggregate_aliases` của scenario.

Nguồn XML thật (pattern FBO chuẩn):

```xml
]]>&VoucherGoodsTypeFomulaGrid;<![CDATA[
```

Đóng CDATA → chèn entity → mở CDATA lại. Expander thay `&Entity;` nhưng **để lại** `]]>` và có thể `<![CDATA[`.

## Root cause

`GaDeclarationExtractor.extractGaDeclaration` / `flatText` expand entity **không strip** marker CDATA còn sót quanh chỗ xen entity.

File liên quan:

- `src/ReadXMLByJS/FormulaHover/GaDeclarationExtractor.js` (ưu tiên fix tại đây — Hover cũng hưởng lợi)
- và/hoặc sanitize trong `GaFormulaMapBuilder.buildFormulaMap` trước khi split entry
- và/hoặc `FormulaModelBuilder` khi đọc `gaBlock`

## Cách sửa (bắt buộc)

Sau khi có `gaBlock` string (và/hoặc trong `buildFormulaMap` đầu vào):

1. Loại bỏ mọi occurrence:
   - `]]>`
   - `<![CDATA[`
   - `]]` dư nếu còn (cẩn thận không phá `>=` trong expression — **chỉ** xóa đúng token CDATA trên, không xóa `>` đơn)
2. Chuẩn hóa whitespace quanh chỗ đã xóa (giữ dấu phẩy giữa entry).

Khuyến nghị: hàm `sanitizeGaBlockForParse(text)` gọi từ:

- cuối `extractGaDeclaration` (return), **hoặc**
- đầu `buildFormulaMap`

Ưu tiên **một chỗ** dùng chung Hover + Formula Preview.

Khi parse alias: `alias = alias.replace(/^\]\]>/, '').replace(/^<!\[CDATA\[/, '').trim()` — defense in depth.

## Test bắt buộc

`GaFormulaMapAggregate.test.js` hoặc test mới:

```js
const polluted = `g.$a = {
  tienmt_ty_le: '[tienmt]:=[tien2]',
  ]]>t_tien_giam_nt: ['t_tien_giam_nt', '[tien_nt2]', '[loai] == "90"'],
  t_ck_nt: ['t_ck_nt', 'ck_nt']
};`;
const map = buildFormulaMap(sanitize(polluted)); // hoặc extract path
assert.ok(map.has('t_tien_giam_nt'));
assert.ok(!map.has(']]>t_tien_giam_nt'));
assert.strictEqual(map.get('t_tien_giam_nt').kind, 'aggregate_filter');
```

Smoke DHN:

```js
assert.ok(!model.entries.some(e => e.alias.includes(']]>') || e.alias.includes('CDATA')));
assert.ok(model.entries.some(e => e.alias === 't_tien_giam_nt') || entity rỗng trên project khác);
```

(Trên FBISP229 entity VoucherGoodsType không rỗng → phải có `t_tien_giam_nt` sạch.)

## Done

- [ ] Không còn alias chứa `]]>` / `CDATA`
- [ ] `t_tien_giam_nt` (và anh em entity) parse đúng kind filter
- [ ] Hover `g.$a.…` trên Grid không regress (smoke)
- [ ] Unit test polluted string pass

## Không làm

- Không sửa file XML khách (`DHNDetail.xml`)
- Không bỏ hỗ trợ entity xen giữa `g.$a`
