# 06 — Extension Integration

## Cấu trúc thư mục

```
src/FormulaPreview/
  index.js
  FormulaPreviewCommand.js
  FormulaPreviewPanel.js
  parser/
    FieldCatalogParser.js
    FormulaAstParser.js
    ScenarioParser.js
    FormulaModelBuilder.js
  media/
    preview.html
    bundle.js
    bundle.js.map
    src/
      App.jsx
      components/
        PlaygroundHero.jsx
        FormulaFlowCanvas.jsx
        ScenarioTab.jsx
        DictionaryTab.jsx
        RawFormulaTab.jsx
        CustomNodes/
          FieldNode.jsx
          AggregateNode.jsx
      hooks/
        useFormulaEvaluator.js
      styles/
        preview.css
  tests/
    fixtures/
      mini-ga-grid.xml
    FormulaAstParser.test.js
    ScenarioParser.test.js
    FormulaModelBuilder.test.js
    GaFormulaMapAggregate.test.js

src/doc/formula-preview/          ← docs (thư mục này)
```

Tái sử dụng:

- `../ReadXMLByJS/FormulaHover/GaDeclarationExtractor.js`
- `../ReadXMLByJS/FormulaHover/GaFormulaMapBuilder.js` (mở rộng)
- `../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander.js`
- `../ReadXMLByJS/entityResolver.js` (invalidateCache khi save)

---

## Đăng ký command & Tách biệt Module Độc Lập

> [!IMPORTANT]
> **Nguyên tắc Kiến trúc (Modular & Clean):**
> - Toàn bộ mã nguồn, logic phân tích, command, panel, parser, media UI và test **phải nằm gọn trong folder riêng `src/FormulaPreview/`**.
> - Tuyệt đối **không code lồng logic, không viết thêm biến/hàm xử lý nghiệp vụ vào các file cũ** (`src/extension.js`, `src/ReadXMLByJS/XmlFlatPreview/`, `src/PreviewForm/`...).
> - `src/extension.js` chỉ đóng vai trò entry point nạp module và đăng ký command qua đúng 2 dòng code.

### `src/FormulaPreview/index.js`

```js
const vscode = require('vscode');
const FormulaPreviewCommand = require('./FormulaPreviewCommand');

function registerFormulaPreview(context) {
  const disposable = vscode.commands.registerCommand(
    'fbo-autocomplete.previewFormula',
    () => FormulaPreviewCommand.run(context)
  );
  context.subscriptions.push(disposable);
}

module.exports = { registerFormulaPreview };
```

### Nhúng nhẹ vào `src/extension.js`

```js
const { registerFormulaPreview } = require('./FormulaPreview');

// Trong hàm activate(context), cạnh registerXmlFlatPreview:
registerFormulaPreview(context);
```

### `package.json` contributes

**commands:**

```json
{
  "command": "fbo-autocomplete.previewFormula",
  "title": "Preview Công thức",
  "icon": "$(symbol-operator)"
}
```

**menus:** thêm vào `fbo-autocomplete.fboSubmenu` và `editor/title` (when `.xml`), cạnh `previewXmlFlat` / `previewForm`.

---

## FormulaPreviewCommand

Mirror `XmlFlatPreviewCommand`:

1. `activeTextEditor` bắt buộc.
2. `scheme === 'file'`, ext `.xml`.
3. Path phải match `Grid` folder (`/Grid/` hoặc `\Grid\` — case-insensitive). Không đúng → `showWarningMessage` và **return** (chặn cứng).
4. Dirty → hỏi Lưu và Preview / Preview từ đĩa / hủy (copy text XmlFlatPreview).
5. `withProgress` notification ngắn → `FormulaPreviewPanel.createOrShow(context, file_path)`.

---

## FormulaPreviewPanel

Mirror `XmlFlatPreviewPanel` + handshake PreviewForm:

| Hành vi | Chi tiết |
|---------|----------|
| Map panels | `normalizedPath → panel` |
| createOrShow | reveal + refresh nếu đã mở |
| viewType | `formulaPreview` |
| title | `Công thức: {basename}` |
| ViewColumn | Beside |
| options | `enableScripts`, `retainContextWhenHidden`, `localResourceRoots` = `media/` (+ dirname file nếu cần) |
| HTML | `preview.html` + `asWebviewUri(bundle.js)`; CSS React Flow đi kèm trong bundle (`style-loader`) |
| refresh | buffer → expand → FormulaModelBuilder → `postMessage({ type:'formulaModel', ... })` |
| ready | đợi `{ type:'ready' }` rồi mới gửi model |
| onDidSaveTextDocument | file hiện tại hoặc path có `controllers` → `entityResolver.invalidateCache` + refresh |
| onDidChangeTextDocument | cùng file → debounce 400ms → refresh |
| dispose | clear map + timers |

### CSP gợi ý

```
default-src 'none';
style-src ${cspSource} 'unsafe-inline';
script-src ${cspSource};
font-src ${cspSource};
img-src ${cspSource} data:;
```

`preview.html` chỉ có `<div id="root"></div>` + `<script src="bundle.js">` qua `asWebviewUri` — **không** inline logic dài.

### Message

Xem [05-ui-playground.md](./05-ui-playground.md) § Message protocol.

`copy` → `vscode.env.clipboard.writeText` + optional info message.

---

## Webpack Build Pipeline

Đóng gói React + React Flow bằng Webpack riêng (mirror `webpack.previewForm.config.js`):

### `webpack.formulaPreview.config.js`

```javascript
const path = require('path');

module.exports = {
  entry: './src/FormulaPreview/media/src/App.jsx',
  output: {
    path: path.resolve(__dirname, 'src/FormulaPreview/media'),
    filename: 'bundle.js',
  },
  devtool: 'source-map',
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
};
```

### Dependencies (dev/build — được webpack nhét vào `bundle.js`)

- `dependencies` (hoặc devDependencies đều được nếu chỉ dùng trong webview build): `react`, `react-dom`, `@xyflow/react`, `dagre`
- `devDependencies`: `@babel/preset-react`
- **Không** thêm các package này vào production deps khi `build-package.js` prune VSIX (giống Preact của Preview Form: chỉ ship `bundle.js`).

### npm scripts (`package.json`)

```json
"build:formula-preview": "node ./node_modules/webpack/bin/webpack.js --config webpack.formulaPreview.config.js",
"watch:formula-preview": "node ./node_modules/webpack/bin/webpack.js --config webpack.formulaPreview.config.js --watch"
```

Evaluator: hook `useFormulaEvaluator.js` trong bundle (eval AST trên client).

---

## Build / package (khớp repo hiện tại)

`.vscodeignore` đang có rule `src/**` rồi whitelist từng asset webview. Agent **bắt buộc**:

1. Thêm dòng (cạnh Preview Form):

```
!src/FormulaPreview/media/bundle.js
```

2. Trong `build-package.js`, sau `build:preview-form`, chạy:

```js
execSync("npm run build:formula-preview", { stdio: "inherit", cwd: __dirname, shell: isWin });
```

3. Thêm `src/FormulaPreview/media/bundle.js` vào checklist file tồn tại trước khi `vsce package` (nếu repo có list verify tương tự Preview Form).

4. Host: `registerFormulaPreview` phải được `require` từ `src/extension.js` để webpack host (`npm run build` → `src/dist/extension.js`) gom Panel/parser vào dist.

5. Test local Dev Host: chạy `npm run build:formula-preview` trước F5 nếu đổi JSX.

6. Unit test parser: `node src/FormulaPreview/tests/...`; optional script `test:formula-preview`.

---

## Đồng tồn với FormulaHover

Hover **giữ nguyên**. Parser dùng chung `buildFormulaMap`. Không register command trùng. Không phá test Flat Preview / Preview Form.
