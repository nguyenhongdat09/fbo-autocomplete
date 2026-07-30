# 07 — Implementation Plan (cho Gemini)

> **For agentic workers:** Implement theo task; mỗi task có Done criteria. Đọc [README.md](./README.md) → docs 01–06 trước khi code.  
> **REQUIRED docs:** 02 domain, 03 model, 04 parser, 05 UI, 06 integration.

**Goal:** Ship Preview Form MVP trong extension `fbo-autocomplete`.

**Architecture:** Expand entities → `FormXmlParser` → `FormModel` → Webview Preact+htm+Toolkit.

**Tech:** Node (extension host), `fast-xml-parser`, Preact, htm, `@vscode/webview-ui-toolkit`, webpack webview bundle.

---

## Task 1: Dependencies + scaffold folders

**Files:**
- Modify: `package.json` (dependencies + scripts `build:preview-form` / `watch:preview-form`)
- Create: `webpack.previewForm.config.js` (hoặc entry trong webpack hiện có)
- Create: folders `src/PreviewForm/parser`, `media/src`, `tests`

**Steps:**
- [ ] `npm install preact htm @vscode/webview-ui-toolkit fast-xml-parser --save`
- [ ] Tạo webpack config target `web`, entry `media/src/main.js`, output `media/bundle.js`
- [ ] Tạo `media/src/main.js` stub: import + register Toolkit (xem [06-extension-integration.md § Toolkit ESM](./06-extension-integration.md))
- [ ] `npm run build:preview-form` → xác nhận `bundle.js` sinh ra **có size > 100KB** (Preact + Toolkit đã bundle). Nếu < 10KB → kiểm tra lại import path / webpack externals
- [ ] Commit: `chore: scaffold PreviewForm deps and webpack entry`

**Done:** `npm run build:preview-form` chạy được, bundle.js > 100KB.

---

## Task 2: `classifyField` + unit test

**Files:**
- Create: `src/PreviewForm/parser/classifyField.js`
- Create: `src/PreviewForm/tests/classifyField.test.js`

**Pattern test:** giống XmlFlatPreview — `assert` + hàm `run()` + `require.main === module && run()`.

- [ ] Implement classify theo [04-parser-spec.md](./04-parser-spec.md) (Grid → DropDown → Boolean → DateTime → input; readOnly; options; placeholder)
- [ ] Test 5 kinds + readOnly + Label/Description headers
- [ ] Run: `node src/PreviewForm/tests/classifyField.test.js` → pass
- [ ] Commit: `feat(preview-form): classify Dir field kinds`

**Done:** test file exit 0.

---

## Task 3: `FormXmlParser` + tests

**Files:**
- Create: `src/PreviewForm/parser/FormXmlParser.js`
- Create: `src/PreviewForm/parser/viewItemUtils.js` (parse pattern, cells, columns)
- Create: `src/PreviewForm/tests/FormXmlParser.test.js`
- Create: `src/PreviewForm/tests/fixtures/mini-dir.xml` (XML nhỏ inline đủ general/tab/grid/footer)

- [ ] `parse_form_xml(flat_text, meta)` → FormModel đúng [03-form-model.md](./03-form-model.md)
- [ ] Tests: category declaration order; footer -1; general; grid placeholder; pattern mismatch warning
- [ ] Run tests → pass
- [ ] Commit: `feat(preview-form): parse Dir view into FormModel`

**Done:** mini fixture assert tabs order + `zcdtndgsc_Grid` + footer rows.

---

## Task 4: Panel shell + command (HTML stub)

**Files:**
- Create: `src/PreviewForm/PreviewFormPanel.js`
- Create: `src/PreviewForm/PreviewFormCommand.js`
- Create: `src/PreviewForm/index.js`
- Modify: `src/extension.js` — `registerPreviewForm`
- Modify: `package.json` contributes commands/menus

- [ ] Panel: createOrShow, CSP, ready handshake, postMessage formModel
- [ ] refresh: expander + parser
- [ ] Command chặn non-Dir
- [ ] Webview tạm hiện `<pre>${JSON.stringify(model,null,2)}</pre>` nếu bundle chưa sẵn
- [ ] Commit: `feat(preview-form): register Preview Form command and panel`

**Done:** F5 extension → command mở panel → thấy JSON FormModel từ Dir đang mở.

---

## Task 5: Preact UI + Toolkit

**Files:**
- Create: `src/PreviewForm/media/src/main.js`
- Create: `src/PreviewForm/media/previewForm.css`
- Modify: Panel HTML load css + bundle
- Run build:preview-form

- [ ] Components theo [05-ui-preact.md](./05-ui-preact.md)
- [ ] General + tabs + sticky footer
- [ ] FieldControl map kinds; readonly/description plain text; grid placeholder
- [ ] Commit: `feat(preview-form): render FormModel with Preact and toolkit`

**Done:** panel hiển thị form controls, không chỉ JSON.

---

## Task 6: Live reload

**Files:**
- Modify: `PreviewFormPanel.js`

- [ ] `onDidSaveTextDocument` → invalidateCache + refresh
- [ ] `onDidChangeTextDocument` debounce 400ms → refresh
- [ ] Clear timer on dispose
- [ ] Commit: `feat(preview-form): live refresh on edit and save`

**Done:** sửa pattern trong editor → preview đổi trong <1s; save DTD → refresh.

---

## Task 7: Polish + acceptance

- [ ] WarningBanner
- [ ] Tab height + overflow notice
- [ ] Chạy hết [08-acceptance-checklist.md](./08-acceptance-checklist.md)
- [ ] Sửa bug blocker
- [ ] Commit: `fix(preview-form): warnings banner and acceptance fixes`

**Done:** checklist 08 tick đủ mục MVP.

---

## Thứ tự ưu tiên nếu thiếu thời gian

1. Parser đúng zone + kinds (Task 2–3)  
2. Panel JSON (Task 4)  
3. UI tabs + footer (Task 5)  
4. Live (Task 6)  

Không bỏ parser để làm UI trước — UI phụ thuộc FormModel ổn định.

---

## Lệnh kiểm thử nhanh

```bash
node src/PreviewForm/tests/classifyField.test.js
node src/PreviewForm/tests/FormXmlParser.test.js
npm run build:preview-form
```

Extension: Launch Debug → mở `Dir/*.xml` → Command `FBO: Preview Form`.
