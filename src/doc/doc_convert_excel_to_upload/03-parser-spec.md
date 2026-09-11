# 03 — Parser Spec

Toàn bộ hàm dưới đây phải **thuần** (không gọi `vscode.window`), nằm trong `src/ConvertExcelFromUpload/parser/`, có unit test.

---

## 1. `detectUploadVersion(xmlText) → 'legacy' | 'template'`

**File:** `UploadVersionDetector.js`

```js
/**
 * @param {string} xmlText
 * @returns {'legacy'|'template'}
 */
function detectUploadVersion(xmlText) {
  // Match opening tag <template ...> or <template>
  // Case-insensitive. Do NOT treat &template; entity as version marker.
}
```

| Input | Output |
|-------|--------|
| Không có `<template` | `legacy` |
| Có `<template>` / `<template >` / `<template\n>` | `template` |
| Comment `<!-- <template> -->` | Vẫn `template` nếu regex đơn giản match (chấp nhận) — hoặc ignore trong comment nếu dễ; **không bắt buộc** ignore comment MVP |

---

## 2. `parseUploadFields(xmlText) → UploadField[]`

**File:** `UploadFieldsParser.js`

```js
/**
 * @typedef {object} UploadField
 * @property {string} name
 * @property {string} column   // uppercase normalized "A".."ZZ"
 * @property {boolean} required // allowNulls === "false"
 * @property {string|null} type
 * @property {string|null} maxLength
 */

/**
 * @param {string} xmlText
 * @returns {{ fields: UploadField[], warnings: string[] }}
 */
function parseUploadFields(xmlText) { }
```

### Rules

1. Quét toàn bộ thẻ `<field ...>` trong document (legacy Upload thường 1 block `<fields>`).
2. Bắt buộc có `name` + `column` — thiếu → skip + `warnings.push(...)`.
3. `required = (allowNulls attr === 'false')` (so sánh không phân biệt hoa thường).
4. `column` normalize: `trim().toUpperCase()`.
5. Không expand entity. Không đọc `<header>` từ Upload (thường không có).

### Test cases tối thiểu

- ARTran snippet: `ma_dvcs`→A required, `ma_kh`→B required, `ngay_ct`→D required, `dien_giai`→G not required.
- Field thiếu `column` → không vào `fields`, có warning.
- Self-closing và có closing tag đều parse được.

---

## 3. `deriveSearchPrefix(fileBaseName) → { mode, prefix, keyword }`

**File:** `SearchPrefixDeriver.js`

```js
/**
 * @param {string} fileBaseName  // "ARTran" or "ARTran.xml" — strip ext nếu có
 * @returns {{ mode: 'prefix'|'exact', prefix: string, keyword: string }}
 */
function deriveSearchPrefix(fileBaseName) { }
```

| base | mode | prefix | keyword |
|------|------|--------|---------|
| `ARTran` | prefix | `AR` | `AR*.xml` |
| `ardetail` | prefix | `ar` | `ar*.xml` (giữ casing 2 ký tự đầu của base sau khi strip) |
| `XXMaster` | prefix | `XX` | `XX*.xml` |
| `zcamdm` | exact | `zcamdm` | `zcamdm.xml` |
| `Customer` | exact | `Customer` | `Customer.xml` |

Suffix check **case-insensitive** trên: `tran`, `detail`, `master`.

Nếu `base.length < 2` và mode prefix → vẫn lấy `base` nguyên (edge), warning tùy chọn.

---

## 4. `filterDirGridPaths(filesRel) → string[]`

Có thể nằm cùng file search helper:

```js
/**
 * @param {string[]} filesRel  // relative paths from GroupFileIndexService
 * @returns {string[]}
 */
function filterDirGridPaths(filesRel) { }
```

Normalize `\` → `/`, lower-case so sánh segment:

- phải chứa `/controllers/dir/` **hoặc** `/controllers/grid/`
- (chấp nhận path bắt đầu `App_Data/Controllers/Dir/...`)

---

## 5. `filterExactBaseName(filesRel, baseName) → string[]`

Dùng khi `mode === 'exact'`:

```js
function filterExactBaseName(filesRel, baseName) {
  // basename without ext equals baseName (case-insensitive)
}
```

---

## 6. `buildHeaderCatalog(flattenedXmlTexts, options) → Map|Object`

**File:** `DirGridHeaderCatalog.js`

```js
/**
 * @param {Array<{ fileLabel: string, flatText: string }>} sources
 *   // thứ tự = thứ tự user chọn
 * @returns {{ catalog: Record<string,string>, warnings: string[] }}
 */
function buildHeaderCatalog(sources) { }
```

### Extract field regex gợi ý

Không bắt buộc XML DOM parser. Pattern tương tự `ConvertGridToHeader.CvtToFieldReport`:

1. Match `<field\b[^>]*>[\s\S]*?</field>` **hoặc** self-closing `<field\b[^>]*/>`.
2. Trong match: `name="..."`, `hidden="..."`, `<header[^>]*\bv="..."`.
3. Skip `hidden="true"`.
4. First-wins theo thứ tự `sources`.

### Test

- Hai nguồn cùng `ma_kh` khác header → giữ header nguồn đầu.
- Field không header → không set catalog (để merge fallback `name`).
- Hidden field không ghi catalog.

---

## 7. `mergeUploadWithHeaders(uploadFields, catalog) → ExcelHeaderCell[]`

```js
/**
 * @typedef {object} ExcelHeaderCell
 * @property {string} name
 * @property {string} column
 * @property {string} header
 * @property {boolean} required
 */

/**
 * @param {UploadField[]} uploadFields
 * @param {Record<string,string>} catalog
 * @returns {ExcelHeaderCell[]}
 */
function mergeUploadWithHeaders(uploadFields, catalog) {
  // header = catalog[name] || name
}
```

Giữ **thứ tự** `uploadFields` (thứ tự trong Upload XML).

---

## 8. `isUploadFolderPath(fsPath) → boolean`

Helper thuần path:

```js
function isUploadFolderPath(fsPath) {
  const n = String(fsPath || '').replace(/\\/g, '/').toLowerCase();
  return n.includes('/templates/upload/') || /\/templates\/upload\/[^/]+\.xml$/i.test(n);
}
```

---

## Module exports đề xuất

```
parser/
  UploadVersionDetector.js      // detectUploadVersion
  UploadFieldsParser.js         // parseUploadFields
  SearchPrefixDeriver.js        // deriveSearchPrefix, filterDirGridPaths, filterExactBaseName, isUploadFolderPath
  DirGridHeaderCatalog.js       // buildHeaderCatalog, mergeUploadWithHeaders
```

Hoặc gộp filter path vào `SearchPrefixDeriver.js` / `DirGridPathFilter.js` — agent chọn 1 cách, miễn test cover đủ.
