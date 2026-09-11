# 07 — Implementation Plan (cho Gemini)

> **For agentic workers:** Implement theo task; mỗi task có Done criteria. Đọc [README.md](./README.md) → docs 01–06 trước khi code.  
> **REQUIRED:** 02 domain, 03 model, 04 parser, 05 UI, 06 integration.

**Goal:** Ship Preview Công thức MVP trong `fbo-autocomplete`.

**Architecture:** Flatten → FormulaModel → Panel Beside → React + React Flow (`@xyflow/react`) Webview.

**Tech:** Node (extension host), tái sử dụng FormulaHover + XmlEntityExpander, Webview React + `@xyflow/react` + `dagre` + Webpack bundle.

---

## Task 1: Scaffold + command shell + Webpack setup

**Files:**

- Create: `src/FormulaPreview/index.js`, `FormulaPreviewCommand.js`, `FormulaPreviewPanel.js`
- Create: `webpack.formulaPreview.config.js`
- Create: `media/preview.html` (chứa `#root` + nạp `bundle.js`), `media/src/App.jsx`, `media/src/styles/preview.css`
- Modify: `src/extension.js`, `package.json` (dependencies, command + menus, npm scripts)

**Steps:**

- [ ] Cài packages: `react`, `react-dom`, `@xyflow/react`, `dagre`, `@babel/preset-react`
- [ ] `webpack.formulaPreview.config.js` + script `build:formula-preview` / `watch:formula-preview`
- [ ] `.vscodeignore`: `!src/FormulaPreview/media/bundle.js`
- [ ] `build-package.js`: gọi `npm run build:formula-preview` (cạnh preview-form)
- [ ] Register command; chặn non-Grid; Panel + CSP + ready handshake
- [ ] `npm run build:formula-preview` → `bundle.js` size hợp lý (có React Flow, thường ≫ 100KB)
- [ ] refresh tạm postMessage FormulaModel tối thiểu
- [ ] F5 → panel Beside hiện React stub

**Done:** Panel mở trên Grid; non-Grid bị chặn; whitelist + build script đã có.

---

## Task 2: Mở rộng `GaFormulaMapBuilder` + AST

**Files:**

- Modify: `GaFormulaMapBuilder.js`
- Create: `parser/FormulaAstParser.js`
- Create: tests AST + aggregate 2/3

**Steps:**

- [ ] Parse aggregate 2 & 3 phần tử
- [ ] `parseExpression` + `toPlainVi` + `collectRefs`
- [ ] Tests: DHN samples (tien_nt2_sl, thue_nt, tien_mthang_nt ternary, gia_nt_sl nested, VoucherGoodsType filter)
- [ ] `node ...test.js` exit 0

**Done:** Test AST/aggregate xanh; Hover cũ vẫn load (smoke mở Grid, hover `g.$a.tien2`).

---

## Task 3: Field catalog + companion Dir + ModelBuilder

**Files:**

- `FieldCatalogParser.js`, `FormulaModelBuilder.js`
- tests + `fixtures/mini-ga-grid.xml`

**Steps:**

- [ ] Parse fields từ flat XML
- [ ] Resolve DHNDetail → DHNTran best-effort
- [ ] `buildFormulaModel(file_path, raw_xml) → FormulaModel`
- [ ] Warnings thiếu g.$a / thiếu Dir

**Done:** Builder trên fixture trả `entries.length >= 5`, có `plain_vi` không rỗng.

---

## Task 4: ScenarioParser

**Files:**

- `ScenarioParser.js` + test từ fixture onChange tối thiểu + concat getRowPhi

**Steps:**

- [ ] Extract case `so_luong` / `gia_nt` / `phi_dvtn_yn`
- [ ] Resolve `getAggregate` / `getMaster` / `getRowPhi`
- [ ] `extra_js` khi có `calcGiaDvtn`
- [ ] Synthetic scenario nếu không có onChange

**Done:** Fixture DHN-like: scenario `so_luong.formula_aliases` chứa `tien_nt2_sl` và `tien2`.

---

## Task 5: React Webview playground + evaluator

**Files:**

- `media/src/components/PlaygroundHero.jsx`
- `media/src/hooks/useFormulaEvaluator.js`
- `media/src/App.jsx`

**Steps:**

- [ ] Render hero 2 cột NT/HT từ model + seed
- [ ] Hook `useFormulaEvaluator`: Eval AST theo scenario active khi input change
- [ ] Pulse `.just-updated`; caption `plain_vi`
- [ ] Toggle hiện cột ẩn; Đặt lại demo
- [ ] Chia 0 → 0

**Done:** Với seed DHN: `tien_nt2=1000000`, `ck_nt=50000`, `thue_nt=95000` (ty_gia=1, tl_ck=5, thue_suat=10).

---

## Task 6: React Flow Canvas + Dagre Auto-layout + Tabs

**Files:**

- `media/src/components/FormulaFlowCanvas.jsx`
- `media/src/components/CustomNodes/FieldNode.jsx`
- `media/src/components/CustomNodes/AggregateNode.jsx`
- `media/src/components/ScenarioTab.jsx`, `DictionaryTab.jsx`, `RawFormulaTab.jsx`

**Steps:**

- [ ] Setup React Flow canvas với Dagre auto-layout direction `LR`
- [ ] Tạo Custom Nodes: `FieldNode` (badge Nhập/Tính, giá trị live) và `AggregateNode`
- [ ] Tạo Edges: solid cho formula, dashed cho aggregate, `animated: true` cho bước vừa chạy
- [ ] Click node trên Canvas $\leftrightarrow$ focus ô Sân chơi Hero
- [ ] Tab scenarios chọn được
- [ ] Bảng từ điển + raw `g.$a` + copy
- [ ] Banner warnings

**Done:** Canvas React Flow tự vẽ và xếp tầng các node đẹp mắt; click “Khi sửa Giá nt” đổi chain và layout; từ điển có `tien_nt2_sl`.

---

## Task 7: Live refresh + dirty save UX + acceptance

**Steps:**

- [ ] Debounce 400ms onDidChangeTextDocument
- [ ] Save Controllers → invalidate + refresh
- [ ] Dirty dialog giống Flat Preview
- [ ] Chạy [08-acceptance-checklist.md](./08-acceptance-checklist.md) trên DHNDetail thật (network path user)
- [ ] Script npm optional `test:formula-preview`

**Done:** Checklist 08 mục A–E pass; không regress Flat Preview / Preview Form / Hover.

---

## Thứ tự ưu tiên nếu thiếu thời gian

1. Model + playground số đúng (Task 2–5)  
2. Scenarios (Task 4)  
3. Luồng đẹp (Task 6)  
4. Companion Dir labels (có thể fallback tên field)

Không bỏ evaluator / không ship chỉ bảng raw.
