# 05 — UI Preact + VS Code Webview UI Toolkit

## Mục tiêu UI

Render `FormModel` thành form preview tương tác tab; control dùng Toolkit; **readOnly / Description / lookup_name** dùng plain text.

Không cần giống pixel FBO — cần **đúng cấu trúc vùng** và **đúng bề rộng cột tương đối**.

---

## Stack webview

| Lib | Vai trò |
|-----|---------|
| `preact` | Component + `useState` |
| `htm` / `htm/preact` | Template không JSX: `html\`...\`` |
| `@vscode/webview-ui-toolkit` | `vscode-text-field`, `vscode-dropdown`, `vscode-checkbox`, `vscode-panels`, … |
| CSS riêng | CSS Grid theo `column_widths` px; sticky footer; tab body height |

Bundle entry đề xuất: `src/PreviewForm/media/src/main.js` → webpack → `src/PreviewForm/media/bundle.js`.

Khởi tạo Toolkit (webview):

```js
import { provideVSCodeDesignSystem, vsCodeButton, vsCodeTextField, vsCodeCheckbox, vsCodeDropdown, vsCodeOption, vsCodePanels, vsCodePanelTab, vsCodePanelView, vsCodeBadge, vsCodeDivider } from '@vscode/webview-ui-toolkit';

provideVSCodeDesignSystem().register(
  vsCodeButton(),
  vsCodeTextField(),
  vsCodeCheckbox(),
  vsCodeDropdown(),
  vsCodeOption(),
  vsCodePanels(),
  vsCodePanelTab(),
  vsCodePanelView(),
  vsCodeBadge(),
  vsCodeDivider()
);
```

---

## Cây component

```
FormPreviewApp
├── WarningBanner          (warnings[])
├── GeneralSection         (rows_general)
│     └── FieldRow[] 
├── TabSection
│     └── vscode-panels
│           ├── vscode-panel-tab[]   (categories theo mảng — declaration order)
│           └── vscode-panel-view[]
│                 └── TabBody (min-height/max-height = view.height)
│                       └── FieldRow[]
└── StickyFooter           (rows_by_category["-1"])
      └── FieldRow[]
```

### State

```js
const [model, setModel] = useState(null);
const [active_tab_ord, setActiveTabOrd] = useState(0); // index trong mảng categories, KHÔNG phải category.index số
```

Lắng nghe `window.addEventListener('message')`:

- `{ type: 'formModel', payload: FormModel }` → `setModel`
- `{ type: 'error', message }` → hiện lỗi
- `{ type: 'warnings' }` có thể gộp trong formModel

Gửi `{ type: 'ready' }` khi mount (giống CheckingErrorPanel) để host post model lần đầu an toàn.

---

## FieldRow — CSS Grid

```css
.field-row {
  display: grid;
  grid-template-columns: var(--row-cols); /* ví dụ: 100px 110px 100px ... */
  column-gap: 0;
  align-items: center;
  min-height: 28px;
  margin-bottom: 4px;
}
.cell-span-n { grid-column: span n; }
.cell-empty { /* chiếm cột, không nội dung */ }
.readonly-value {
  font-size: 13px;
  opacity: 0.95;
  border-bottom: 1px solid var(--vscode-input-border, #ccc);
  padding: 2px 4px;
  min-height: 22px;
}
.description-text { font-size: 12px; opacity: 0.85; }
.grid-placeholder {
  border: 1px dashed var(--vscode-input-border);
  padding: 24px;
  text-align: center;
  font-weight: 600;
}
.tab-body {
  height: var(--tab-height); /* view.height px */
  overflow: auto;
  border: 1px solid var(--vscode-panel-border);
  padding: 8px;
}
.sticky-footer {
  position: sticky;
  bottom: 0;
  background: var(--vscode-editor-background);
  border-top: 1px solid var(--vscode-panel-border);
  padding: 8px;
  z-index: 2;
}
```

Khi render row:

1. Set `--row-cols` = `column_widths.map(w => (w === 0 ? 'minmax(0,1fr)' : `${w}px`)).join(' ')`.
2. Duyệt `cells`: bỏ qua `span` (đã gộp vào slot trước); `empty` → div trống; `slot` → component theo role + `style={{ gridColumn: span ${col_span} }}`.

---

## FieldControl — map kind

| Điều kiện | Component |
|-----------|-----------| 
| `role === 'label'` | `<label class="field-label">{display_label(f)}</label>` — dùng `header_v \|\| label_v \|\| header_e \|\| label_e \|\| name` |
| `role === 'description'` | `<span class="description-text">{footer_v}</span>` |
| `role === 'lookup_name'` | `<span class="readonly-value">{field}_name</span>` (placeholder text = tên field `%l`, không data thật) |
| `role === 'control'` + `read_only` | `<span class="readonly-value">{header_v or sample}</span>` |
| `role === 'control'` + `disabled` | Render bình thường theo `kind` nhưng thêm `style="opacity:0.55"` và `disabled` attribute |
| `kind === 'grid'` | `<div class="grid-placeholder"><vscode-badge>{grid_placeholder}</vscode-badge></div>` |
| `kind === 'checkbox'` | `<vscode-checkbox>{header_v}</vscode-checkbox>` (nếu label đã ở cột riêng thì checkbox không lặp text — chỉ box) |
| `kind === 'dropdown'` | `<vscode-dropdown>` + `<vscode-option>` từ `options` |
| `kind === 'date'` | `<vscode-text-field type="date">` hoặc text `dd/mm/yyyy` |
| `kind === 'input'` (Decimal/Numeric) | `<vscode-text-field>` — không phân biệt `type="Decimal"` trong preview; hiện ô text bình thường |
| `kind === 'input'` | `<vscode-text-field>` |

> **`type="Decimal"` + `style="Numeric"`:** FBO render số có format runtime. Preview chỉ cần hiện `vscode-text-field` thường — không implement format. Nếu muốn phân biệt, có thể thêm placeholder `"0.00"` nhưng không bắt buộc MVP.

Giá trị mẫu: để trống hoặc value option đầu tiên cho dropdown — **không** bind state nghiệp vụ phức tạp.

---

## Tabs

```html
<vscode-panels activeid=${'tab-' + active_tab_ord}>
  ${categories.map((c, i) => html`
    <vscode-panel-tab id=${'tab-' + i} onClick=${() => setActiveTabOrd(i)}>
      ${c.header_v || c.header_e || ('Tab ' + c.index)}
    </vscode-panel-tab>
  `)}
  ${categories.map((c, i) => html`
    <vscode-panel-view id=${'view-' + i}>
      <div class="tab-body" style=${{ '--tab-height': model.view.height + 'px', height: model.view.height + 'px' }}>
        ${renderRows(model.view.rows_by_category[c.index] || [])}
        ${overflowNotice(...)}
      </div>
    </vscode-panel-view>
  `)}
</vscode-panels>
```

**Quan trọng:** thứ tự `categories` đã là declaration order từ parser — không `.sort` theo `index`.

### Overflow notice

Nếu số row * ~28px > `view.height` → hiện dòng nhỏ trong tab:  
`Cảnh báo: nội dung có thể tràn height=${height}px — tăng view/@height hoặc giảm field.`

(Ước lượng đơn giản đủ dùng; không cần ResizeObserver bắt buộc.)

---

## Sticky footer

Luôn render **dưới** `vscode-panels`, không nằm trong panel-view. Đổi tab không ẩn footer.

---

## Toolbar nhỏ (optional MVP+)

- Nút Refresh → `postMessage({ type: 'refresh' })`
- Hiển thị `file_name` + số warnings

MVP tối thiểu: không toolbar cũng được nếu host auto-push model.

---

## CSP / load script

Host panel set CSP cho phép `script-src` + `style-src` từ `webview.cspSource`, load `bundle.js` qua `asWebviewUri`. Không inline script dài (trừ nonce nếu bắt chước XmlFlatPreview).

Toolkit có thể cần `connect-src` / font — bám doc official webview-ui-toolkit + VS Code webview CSP examples.

---

## Accessibility / i18n

- Ưu tiên `header_v` / `footer_v`; fallback `*_e` rồi `name`.
- Preview không cần đa ngôn ngữ switch trong MVP.
