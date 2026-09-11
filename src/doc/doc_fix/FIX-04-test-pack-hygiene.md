# FIX-04 — Test script + assert pack VSIX thiếu Formula Preview bundle

## Mức: High (trước khi ship VSIX)

## Vấn đề A — `npm run test:formula-preview` không đủ

`package.json` hiện:

```json
"test:formula-preview": "node src/FormulaPreview/tests/FormulaAstParser.test.js"
```

Bỏ qua:

- `GaFormulaMapAggregate.test.js`
- `ScenarioParser.test.js`
- `FormulaModelBuilder.test.js`

### Sửa

Gộp giống `test:xml-flat-preview`: một runner hoặc chuỗi `&&`:

```json
"test:formula-preview": "node src/FormulaPreview/tests/run-all.js"
```

Hoặc:

```json
"test:formula-preview": "node src/FormulaPreview/tests/FormulaAstParser.test.js && node src/FormulaPreview/tests/GaFormulaMapAggregate.test.js && node src/FormulaPreview/tests/ScenarioParser.test.js && node src/FormulaPreview/tests/FormulaModelBuilder.test.js"
```

Nếu tạo `run-all.js`: require từng `run()` và `process.exit(1)` khi assert fail.

## Vấn đề B — `build-package.js` assert thiếu bundle Formula Preview

`assertRuntimeDepsIntact()` có:

```js
"src/PreviewForm/media/bundle.js",
```

**Thiếu:**

```js
"src/FormulaPreview/media/bundle.js",
```

Dù đã `execSync("npm run build:formula-preview")` — nếu build bị skip / path sai, VSIX vẫn pack thiếu whitelist file → panel trắng trên máy khách.

### Sửa

Trong `build-package.js` → mảng `required` của `assertRuntimeDepsIntact`, thêm:

`src/FormulaPreview/media/bundle.js`

(Không bắt buộc assert `preview.html` nếu đã whitelist — nên assert luôn `preview.html` cho chắc.)

## Done

- [ ] `npm run test:formula-preview` chạy **cả 4** (hoặc hơn) test, exit 0
- [ ] `assertRuntimeDepsIntact` fail nếu thiếu `FormulaPreview/media/bundle.js`
- [ ] `.vscodeignore` vẫn có `!src/FormulaPreview/media/bundle.js` và `preview.html` (đã có — chỉ verify)

## Không làm

- Không đổi cách prune `package.json` production deps (React vẫn chỉ trong webpack bundle)
