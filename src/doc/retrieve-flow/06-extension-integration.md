# 06 — Extension Integration

## Nguyên tắc module độc lập (bắt buộc)

> Pattern giống `src/FormulaPreview/` — agent **đọc kỹ** trước khi code.

| Quy tắc | Chi tiết |
|---------|----------|
| Folder riêng | Mọi code mới trong **`src/RetrieveFlow/`** |
| `extension.js` | **Chỉ 2 dòng:** `require` + `registerRetrieveFlow(context)` |
| Không trộn | **Không** thêm logic Retrieve vào `TreeFile/`, `XmlFlatPreview/`, `FormulaPreview/`, `PreviewForm/`, `ContextMenu.js` |
| Tận dụng | Gọi lại helper/module có sẵn (bảng dưới) |
| Extract chung | Nếu cần logic dùng 2 nơi (vd. tạo file .sql temp) → tách ra `src/Utils/` hoặc helper nhỏ, **cập nhật caller cũ** gọi helper — không duplicate |

### Nhúng vào `extension.js`

```js
const { registerRetrieveFlow } = require('./RetrieveFlow');

// Trong activate(context), cạnh registerFormulaPreview:
registerRetrieveFlow(context);
```

### `src/RetrieveFlow/index.js`

```js
const vscode = require('vscode');
const RetrieveFlowCommand = require('./RetrieveFlowCommand');

function registerRetrieveFlow(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'fbo-autocomplete.designRetrieveFlow',
      () => RetrieveFlowCommand.run(context)
    )
  );
}

module.exports = { registerRetrieveFlow };
```

---

## Tận dụng code có sẵn (reuse map)

| Nhu cầu RetrieveFlow | Dùng lại từ | Ghi chú |
|----------------------|-------------|---------|
| Resolve project / Controllers root | [`AppDataPathHelper`](../../TreeFile/AppDataPathHelper.js) | `getBaseProjectPath()` + nối `App_Data/Controllers` — **không** viết walk path mới |
| Panel Beside + singleton Map | Mirror [`XmlFlatPreviewPanel`](../../ReadXMLByJS/XmlFlatPreview/XmlFlatPreviewPanel.js) | Copy **pattern** (createOrShow, dispose, csp) — code nằm trong RetrieveFlowPanel |
| Command dirty-file prompt | Mirror [`XmlFlatPreviewCommand`](../../ReadXMLByJS/XmlFlatPreview/XmlFlatPreviewCommand.js) | Wizard không cần dirty XML — bỏ qua bước này |
| Tạo file `.sql` temp (tên, dedupe) | Logic [`ContextMenu.newSqlTemp`](../../TreeFile/ContextMenu.js) | **Extract** `createSqlTempFile(folder, baseName)` → `src/Utils/sqlTempFile.js`; ContextMenu + RetrieveFlow cùng gọi |
| Config sqlTempFolder | `vscode.workspace.getConfiguration('fbo-autocomplete').get('sqlTempFolder')` | Giống ContextMenu |
| Webview HTML shell + postMessage | Mirror [`FormulaPreviewPanel`](../../FormulaPreview/FormulaPreviewPanel.js) hoặc XmlFlatPreview | Handshake `ready` / `error` |
| Template placeholder replace | Simple `{{key}}` replace — **không** cần XmlEntityExpander | Generator thuần string |
| Ghi file Controllers | `fs.writeFileSync` + `vscode.window.showWarningMessage` overwrite | Có thể tham khảo pattern paste trong AppDataPathHelper |

**Không dùng lại (out of scope):** `XmlEntityExpander`, FormulaHover, MCP — wizard không parse XML nguồn.

---

## Cấu trúc thư mục

```
src/RetrieveFlow/
  index.js
  RetrieveFlowCommand.js
  RetrieveFlowPanel.js
  generator/
    deriveFormInput.js      ← bắt buộc; test riêng
    FormInputValidator.js
    XmlTemplateRenderer.js
    SqlTemplateRenderer.js
    Presets.js
  media/
    preview.html
    retrieveFlow.js
    retrieveFlow.css
  tests/
    XmlTemplateRenderer.test.js
    SqlTemplateRenderer.test.js
    FormInputValidator.test.js

src/Database/RetrieveFlowTemplates/   ← template runtime (pack VSIX — whitelist .vscodeignore)
```

**Anti-pattern:**

```
❌  Thêm registerRetrieveFlow + generator vào extension.js
❌  Sửa XmlFlatPreviewPanel để mở wizard Retrieve
❌  Copy nguyên newSqlTemp vào RetrieveFlowPanel (duplicate)
❌  Tạo AppDataPathHelper2 riêng
```

---

## Command

**id:** `fbo-autocomplete.designRetrieveFlow`  
**title:** `Thiết kế Lấy dữ liệu`

Mirror XmlFlatPreviewCommand:

1. Cần `activeTextEditor`, scheme `file`
2. Không bắt buộc path Grid — wizard dùng được từ bất kỳ XML trong project FBO (resolve Controllers root)
3. `RetrieveFlowPanel.createOrShow(context, { controllers_root, sql_temp_folder })`

---

## RetrieveFlowPanel

| Hành vi | Chi tiết |
|---------|----------|
| Singleton | Theo workspace + panel id |
| ViewColumn | Beside |
| CSP | `default-src 'none'; style-src ${csp}; script-src ${csp}` |
| Config | `fbo-autocomplete.sqlTempFolder` — bắt buộc để Generate SQL |

Resolve `controllers_root` — thứ tự ưu tiên (đã chốt):

1. `AppDataPathHelper(activeEditor.fileName).getBaseProjectPath()` + `\App_Data\Controllers` (hỗ trợ **UNC** `\\172.168.5.14\...` — helper đã có logic CustomerPro)
2. Workspace setting `fbo-autocomplete.controllersRoot` (nếu có — optional override)
3. Fail → `showErrorMessage` + không generate

Không walk path thủ công song song AppDataPathHelper.

---

## Generator

### XmlTemplateRenderer

```js
const derived = deriveFormInput(form);
const dir = derived.src_table_mode === 'single' ? 'single' : 'partitioned';
const tpl_root = path.join(context.extensionPath, 'src', 'Database', 'RetrieveFlowTemplates');
const tpl = loadTemplates(path.join(tpl_root, dir));
return applyAll(tpl, derived);
```

Template path: **`src/Database/RetrieveFlowTemplates/`** — RetrieveFlow **bắt buộc** đọc từ đây (không từ `src/doc/`). Whitelist `!src/Database/RetrieveFlowTemplates/**` trong `.vscodeignore`.

### SqlTemplateRenderer

Đọc [`BeforeAfterUpdate.sql.tpl`](../../Database/RetrieveFlowTemplates/BeforeAfterUpdate.sql.tpl) từ cùng `tpl_root`.

Ghép: addFields + proc branch + sysfilter block + tran/detail block.

### Write files

```js
writeControllers(root, identity, xmlMap, { overwrite: askUser })
writeSqlTemp(folder, `${identity}_retrieve.sql`, content) // dedupe (2), (3)...
```

Tái sử dụng **`createSqlTempFile`** từ `src/Utils/sqlTempFile.js` (extract từ ContextMenu.newSqlTemp) — **không** copy logic dedupe `(2)`, `(3)`.

---

## package.json contributes

```json
{
  "command": "fbo-autocomplete.designRetrieveFlow",
  "title": "Thiết kế Lấy dữ liệu",
  "icon": "$(git-pull-request)"
}
```

Menus: `fbo-autocomplete.fboSubmenu`, `editor/title` when `.xml`.

---

## Tests

Pattern: `assert` + `run()` + `require.main === module`.

- Validator: `$` rules partitioned/single
- Renderer YCNDXA preset: Lookup chứa `convert(char(6)` và `d64$`
- Renderer zcWIMO preset: Lookup chứa `'isx', 'phsx'` và `sl_pxh`
