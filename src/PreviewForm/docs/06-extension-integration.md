# 06 — Extension Integration

## Cấu trúc thư mục (implement)

```
src/PreviewForm/
  index.js                      # registerPreviewForm(context)
  PreviewFormCommand.js
  PreviewFormPanel.js
  parser/
    FormXmlParser.js
    classifyField.js            # optional split
    viewItemUtils.js            # optional
  media/
    previewForm.css
    src/
      main.js                   # Preact entry (htm)
    bundle.js                   # webpack output (gitignore hoặc commit tùy repo)
  tests/
    FormXmlParser.test.js
  docs/                         # đã có
```

---

## Đăng ký command

### `src/PreviewForm/index.js`

```js
const vscode = require('vscode');
const PreviewFormCommand = require('./PreviewFormCommand');

function registerPreviewForm(context) {
  const disposable = vscode.commands.registerCommand('fbo-autocomplete.previewForm', () => {
    PreviewFormCommand.run(context);
  });
  context.subscriptions.push(disposable);
}

module.exports = { registerPreviewForm };
```

### `src/extension.js`

Thêm:

```js
const { registerPreviewForm } = require('./PreviewForm');
// trong activate(), cạnh registerXmlFlatPreview:
registerPreviewForm(context);
```

### `package.json` contributes

**commands:**

```json
{
  "command": "fbo-autocomplete.previewForm",
  "title": "FBO: Preview Form"
}
```

**menus.fbo-autocomplete.fboSubmenu** + **editor/title** (when `resourceExtname == .xml`), cạnh `previewXmlFlat`.

---

## PreviewFormCommand

Mirror `XmlFlatPreviewCommand`:

1. Lấy `activeTextEditor`.
2. Nếu không có / không `.xml` → showErrorMessage.
3. Nếu path không chứa `Dir` / `dir` (separator-insensitive) → showWarning “MVP chỉ hỗ trợ Dir/*.xml” (vẫn cho mở nếu user confirm **hoặc** chặn cứng — **chốt: chặn cứng** + message).
4. `PreviewFormPanel.createOrShow(context, file_path)`.

---

## PreviewFormPanel

Mirror pattern `XmlFlatPreviewPanel`:

| Hành vi | Chi tiết |
|---------|----------|
| Map panels | `filePath → panel` singleton |
| createOrShow | Reveal + refresh nếu đã mở |
| Webview options | `enableScripts`, `retainContextWhenHidden`, `localResourceRoots` = `media/` + dirname file |
| HTML | shell + link css + script bundle + vscode toolkit nếu load từ node_modules via asWebviewUri |
| refresh() | đọc buffer editor ưu tiên → expand → parse → `postMessage({ type:'formModel', payload })` hoặc set html lần đầu |
| ready handshake | đợi `{ type:'ready' }` rồi mới post model (tránh race) |
| onDidSaveTextDocument | cùng rule XmlFlatPreview: file hiện tại hoặc path có `controllers` → invalidate entity cache + refresh |
| onDidChangeTextDocument | nếu doc === file đang preview → debounce 400ms → refresh (không invalidate cache mỗi keystroke trừ khi cần) |
| dispose | clear map + timers |

### Invalidate cache

```js
const entityResolver = require('../ReadXMLByJS/entityResolver');
entityResolver.invalidateCache(this.file_path);
```

(Khi save; không bắt buộc mỗi debounce change.)

### Message từ webview

| type | Host xử lý |
|------|------------|
| `ready` | `webview_ready=true`; push model hiện tại |
| `refresh` | `refresh()` |
| `log` / `error` | console / showErrorMessage |

### Message tới webview

| type | payload |
|------|---------|
| `formModel` | FormModel |
| `error` | `{ message, stack? }` |

---

## Webpack

Repo đã có webpack cho extension. Thêm **entry riêng** cho webview (không bundle vào extension.js):

```js
// ví dụ trong webpack.config.js — thêm entry hoặc file webpack.previewForm.config.js
module.exports = {
  target: 'web',
  entry: './src/PreviewForm/media/src/main.js',
  output: {
    path: path.resolve(__dirname, 'src/PreviewForm/media'),
    filename: 'bundle.js'
  },
  // resolve alias preact/htm
};
```

Scripts `package.json` gợi ý:

```json
"build:preview-form": "webpack --config webpack.previewForm.config.js",
"watch:preview-form": "webpack --config webpack.previewForm.config.js --watch"
```

Dependencies cần cài khi implement:

- `preact`
- `htm`
- `@vscode/webview-ui-toolkit`
- `fast-xml-parser`

### Toolkit ESM / Webpack compatibility

`@vscode/webview-ui-toolkit` dùng ESM. Khi bundle webpack `target: 'web'`, cần đảm bảo:

1. **Resolve ESM đúng:** webpack 5 tự handle, nhưng nên thêm `experiments: { outputModule: false }` để tránh xung đột nếu bundle dùng CommonJS.
2. **Register components trước khi render:** Gọi `provideVSCodeDesignSystem().register(...)` ở đầu `main.js`, **trước** khi Preact render bất kỳ component nào. Nếu quên, custom element `<vscode-text-field>` sẽ render thành DOM element rỗng mà không có lỗi.
3. **CSP `connect-src`:** Toolkit có thể cần fetch font — thêm `connect-src ${webview.cspSource}` nếu thấy lỗi font trong DevTools.
4. **Kiểm tra nhanh sau Task 1:** `npm run build:preview-form` → bundle.js có size > 100KB (gồm Preact + Toolkit). Nếu < 10KB → Toolkit không được bundle đúng (có thể bị external hoặc import lỗi).

```js
// main.js — luôn đặt ở đầu file, trước import Preact components
import { provideVSCodeDesignSystem, vsCodeTextField, vsCodeDropdown,
         vsCodeOption, vsCodeCheckbox, vsCodePanels, vsCodePanelTab,
         vsCodePanelView, vsCodeBadge } from '@vscode/webview-ui-toolkit';

provideVSCodeDesignSystem().register(
  vsCodeTextField(), vsCodeDropdown(), vsCodeOption(),
  vsCodeCheckbox(), vsCodePanels(), vsCodePanelTab(),
  vsCodePanelView(), vsCodeBadge()
);
```

---

## Tái sử dụng XmlEntityExpander

```js
const XmlEntityExpander = require('../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');
```

Dùng `expanded.flat_text`. Không copy logic expand.

---

## Kiểm tra path Dir

```js
function is_dir_controller(file_path) {
  const n = file_path.replace(/\//g, '\\').toLowerCase();
  return n.includes('\\dir\\') && n.endsWith('.xml');
}
```

---

## Debugging tips (ghi cho Gemini)

- Mở Webview DevTools: Command Palette → “Developer: Open Webview Developer Tools”.
- Log FormModel ra file tạm nếu cần so với `docs/examples/tntran-form-model.snippet.json`.
- So sánh flat preview (`previewXmlFlat`) nếu entity thiếu — cùng expander.
