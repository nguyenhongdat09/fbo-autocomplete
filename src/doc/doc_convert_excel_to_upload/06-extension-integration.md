# 06 — Extension Integration

## Nguyên tắc module độc lập (bắt buộc)

| Quy tắc | Chi tiết |
|---------|----------|
| Folder riêng | Mọi code mới trong **`src/ConvertExcelFromUpload/`** |
| `extension.js` | **Chỉ ~2 dòng:** `require` + `registerConvertExcelFromUpload(context, deps)` |
| Không trộn | **Không** nhét logic vào `ConvertToExcel/`, `TreeFile/`, `FormulaPreview/`, `RetrieveFlow/`, `ContextMenu.js` |
| Tận dụng | Helper/module có sẵn (bảng dưới) |
| Docs | Bộ này tại `src/doc/doc_convert_excel_to_upload/` — không copy vào runtime |

---

## Nhúng vào `extension.js`

```js
const { registerConvertExcelFromUpload } = require('./ConvertExcelFromUpload');

// Trong activate(context), sau khi tree provider đã run / có index service:
registerConvertExcelFromUpload(context, {
  getIndexService: () => treeFileProvider.getGroupFileIndexService
    ? treeFileProvider.getGroupFileIndexService()
    : treeFileProvider._groupFileIndexService,
});
```

> Agent nên thêm `getGroupFileIndexService()` public trên provider đang dùng (`TreeFileProvider`, `TreeFileProviderOneLevel`, `TreeFileProviderDynamic`) — thin return `this._groupFileIndexService`.

### `src/ConvertExcelFromUpload/index.js`

```js
const vscode = require('vscode');
const ConvertExcelFromUploadCommand = require('./ConvertExcelFromUploadCommand');

/**
 * @param {import('vscode').ExtensionContext} context
 * @param {{ getIndexService: () => any }} deps
 */
function registerConvertExcelFromUpload(context, deps) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'fbo-autocomplete.ConvertExcelFromUpload',
      () => ConvertExcelFromUploadCommand.run(context, deps)
    )
  );
}

module.exports = { registerConvertExcelFromUpload };
```

---

## Tận dụng code có sẵn (reuse map)

| Nhu cầu | Dùng lại từ | Ghi chú |
|---------|-------------|---------|
| Project root | [`AppDataPathHelper`](../../TreeFile/AppDataPathHelper.js) | `getProjectPath()` |
| Search file index | [`GroupFileIndexService`](../../TreeFile/SearchFile/GroupFileIndexService.js) | Inject từ Tree — không new instance |
| Flatten Dir/Grid | [`XmlEntityExpander.expandXmlEntities`](../../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander.js) + [`entityResolver.readFileContent`](../../ReadXMLByJS/entityResolver.js) | |
| ExcelJS pattern | [`ConvertGridToHeader.exportToExcel`](../../ConvertToExcel/ConvertGridToHeader.js) | Copy **ý tưởng**, template/row khác; **không** sửa file cũ |
| Bundled DB path | [`resolveBundledDatabaseRoot`](../../extensionDatabasePaths.js) | `upload_chuan.xlsx` |
| Command mẫu đăng ký | `ConvertToExcel` / `registerRetrieveFlow` | package.json + extension.js |

**Không dùng:** PivotExcel.exe, mau_chuan.xlsx, FormulaPreview webview, RetrieveFlow panel.

---

## Cấu trúc thư mục

```
src/ConvertExcelFromUpload/
  index.js
  ConvertExcelFromUploadCommand.js
  parser/
    UploadVersionDetector.js
    UploadFieldsParser.js
    SearchPrefixDeriver.js
    DirGridHeaderCatalog.js
  excel/
    UploadExcelExporter.js
  tests/
    run-all.js
    UploadVersionDetector.test.js
    UploadFieldsParser.test.js
    SearchPrefixDeriver.test.js
    DirGridHeaderCatalog.test.js
    fixtures/          # optional: snippet XML nhỏ

src/Database/upload_chuan.xlsx   ← đã có; nhớ whitelist .vscodeignore

src/doc/doc_convert_excel_to_upload/   ← docs (bộ này)
```

**Anti-pattern:**

```
❌  Thêm toàn bộ parser vào extension.js
❌  Sửa ConvertGridToHeader để nhận mode "upload"
❌  New GroupFileIndexService riêng trong command (dup LevelDB)
❌  Hardcode đường dẫn UNC Gate-FBOR2 trong code
```

---

## package.json

Thêm cạnh command ConvertToExcel:

```json
{
  "command": "fbo-autocomplete.ConvertExcelFromUpload",
  "title": "FBO: Convert Excel From Upload"
}
```

Activation: extension đã `onStartupFinished` — **không bắt buộc** thêm `onCommand:...` riêng; optional thêm cho cold-start.

Menus (optional MVP):

```json
"editor/title": [{
  "command": "fbo-autocomplete.ConvertExcelFromUpload",
  "when": "resourceExtname == .xml && resourcePath =~ /[\\\\/]Upload[\\\\/]/i",
  "group": "navigation"
}]
```

Không bắt buộc nếu khó `when` clause — Command Palette đủ.

---

## `.vscodeignore`

```
!src/Database/upload_chuan.xlsx
```

Giữ nguyên `!src/Database/mau_chuan.xlsx`.

---

## Flow `ConvertExcelFromUploadCommand.run`

```
1. activeTextEditor? language/xml hoặc .xml
2. isUploadFolderPath(fsPath) → else error
3. read file text (fs or document.getText())
4. detectUploadVersion → template? error
5. parseUploadFields → empty? error
6. deriveSearchPrefix(basename)
7. groupRoot = AppDataPathHelper(fsPath).getProjectPath()
8. indexService = deps.getIndexService(); null? error
9. search + filter Dir/Grid (+ exact)
10. QuickPick canPickMany
11. flatten each + buildHeaderCatalog + mergeUploadWithHeaders
12. SaveDialog
13. exportUploadExcel
14. openExternal + info toast
```

Bọc try/catch: log console + `showErrorMessage` message ngắn.

---

## Tests runner

`package.json` scripts (optional mirror RetrieveFlow):

```json
"test:convert-excel-upload": "node src/ConvertExcelFromUpload/tests/run-all.js"
```

`run-all.js` require lần lượt các `*.test.js`, `process.exit(1)` nếu fail — giống [`RetrieveFlow/tests/run-all.js`](../../RetrieveFlow/tests/run-all.js).
