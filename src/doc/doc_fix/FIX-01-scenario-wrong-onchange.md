# FIX-01 — ScenarioParser bắt nhầm `onChange` → synthetic trên DHNDetail

## Mức: BLOCKER

## Hiện tượng (đã reproduce)

Mở / build model từ:

`\\172.168.5.14\CustomerPro\FBI\CNNB_FBI\FBISP229\App_Data\Controllers\Grid\DHNDetail.xml`

Kết quả sai:

- Chỉ **3** scenario: `so_luong`, `gia_nt`, `phi_dvtn_yn` (thiếu `gia`, `tien_nt2`, `tl_ck`, `tien2`, `ck_nt`, `phi_dvtn_yn` case thật, …).
- Mọi scenario có **cùng** `formula_aliases.length` (chứa gần hết alias: `gia_nt_sl`, `tien2_sl`, …).
- `extra_js === false` dù case `so_luong` thật có `calcGiaDvtn$…`.

Đây là hành vi **`buildSyntheticScenarios`**, không phải parse `switch (name)` thật.

## Root cause

Trong `DHNDetail.xml` có **nhiều** hàm:

```
onChange$GridVoucherDetail$GoodsType   ← one-liner, KHÔNG có switch
onChange$GridVoucherDetail$TaxCode
onChange$GridVoucherDetail$TaxAccount
onChange$GridVoucherDetail$            ← CÓ switch (name) — ĐÂY LÀ HÀM CẦN
```

`ScenarioParser.parse` dùng:

```js
scriptText.match(/function\s+onChange\$[\w$]*\s*\([^)]*\)\s*\{/i)
```

→ khớp **GoodsType trước** → không có `switch` → return synthetic.

File: `src/FormulaPreview/parser/ScenarioParser.js`

## Cách sửa (bắt buộc)

1. **Không** lấy `onChange$` đầu tiên.
2. Tìm **tất cả** `function onChange$…(` bằng brace-match body.
3. Chọn hàm có `switch (` trên biến kiểu `name` / `o.field.Name` / tương đương.
4. Nếu nhiều hàm có switch: ưu tiên tên kết thúc bằng `$` sau `Detail` / body dài nhất / nhiều `case` nhất.
5. Chỉ khi **không** hàm nào có switch → mới `buildSyntheticScenarios` + (optional) warning `NO_ONCHANGE` đã có ở builder.

Pseudo:

```js
const candidates = findAllOnChangeFunctions(scriptText); // { name, body }[]
const withSwitch = candidates.filter(c => /switch\s*\(\s*[\w$.]+\s*\)\s*\{/.test(c.body));
if (withSwitch.length === 0) return buildSyntheticScenarios(...);
const best = pickBest(withSwitch); // ưu tiên nhiều case '...' nhất
// parse switch trong best.body như hiện tại
```

## Test bắt buộc

### A. Unit — cập nhật / thêm fixture

Trong `ScenarioParser.test.js` (hoặc file mới):

```js
// Script có GoodsType trước + onChange chính sau
function onChange$GridVoucherDetail$GoodsType(o) { o.grid.request(o, 'GoodsType'); }
function onChange$GridVoucherDetail$(sender, eventArgs) {
  var name = eventArgs.get_object().field.Name;
  switch (name) {
    case 'so_luong':
      g.validExpression(o, [g.$a.tien_nt2_sl, g.$a.tien2], agg, master);
      calcGiaDvtn$GridVoucherDetail$All(g);
      break;
    case 'gia':
      g.validExpression(o, [g.$a.tien2_sl], agg, master);
      break;
    case 'tl_ck':
      g.validExpression(o, [g.$a.ck_nt], agg, master);
      break;
  }
}
```

Assert:

- `scenarios.length >= 3`
- Có id `so_luong`, `gia`, `tl_ck`
- `so_luong.formula_aliases` **có** `tien_nt2_sl`, `tien2`
- `so_luong.formula_aliases` **không** có `tien2_sl` (trừ khi thật sự nằm trong case)
- `so_luong.extra_js === true`

### B. Smoke DHN (script node tạm hoặc test mới)

```js
const model = FormulaModelBuilder.build(dhnPath, raw);
assert.ok(model.scenarios.length >= 8); // DHN có nhiều case
const so = model.scenarios.find(s => s.id === 'so_luong');
assert.ok(so.formula_aliases.includes('tien_nt2_sl'));
assert.ok(!so.formula_aliases.includes('gia_nt_sl')); // không phải synthetic-all
assert.strictEqual(
  new Set(model.scenarios.map(s => s.formula_aliases.length)).size > 1,
  true
); // các case khác độ dài chain
```

## Done

- [ ] Test unit multi-onChange pass
- [ ] Smoke DHN: không còn đúng 3 scenario synthetic
- [ ] Case `so_luong` khớp `validExpression` thật + `row_phi` expand
- [ ] Fixture cũ `ScenarioParser.test.js` vẫn pass

## Không làm

- Không đổi schema `FormulaModel`
- Không mô phỏng `calcGiaDvtn` (chỉ `extra_js`)
