# Preview Công thức (`g.$a`) — Tài liệu triển khai cho Gemini

Bộ tài liệu mô tả **đầy đủ** tính năng **Preview Formula** của extension `fbo-autocomplete`: mở Webview VS Code **cạnh editor**, lấy khối `g.$a` (sau khi flatten entity) và **trình diễn công thức** thành sân chơi 1 dòng + luồng nghiệp vụ tiếng Việt.

> **Phạm vi docs:** đặc tả + kế hoạch implement. Agent đọc theo thứ tự bên dưới rồi code. Không hỏi lại các quyết định đã chốt.

---

## Cách đọc (bắt buộc theo thứ tự)

| # | File | Nội dung |
|---|------|----------|
| 1 | [01-requirements.md](./01-requirements.md) | Mục tiêu, user stories, non-goals, Done |
| 2 | [02-domain-rules.md](./02-domain-rules.md) | Quy tắc FBO: `g.$a`, nguyên tệ/hạch toán, `onChange`, aggregate |
| 3 | [03-formula-model.md](./03-formula-model.md) | Schema JSON `FormulaModel` |
| 4 | [04-parser-spec.md](./04-parser-spec.md) | Spec parser: XML → FormulaModel |
| 5 | [05-ui-playground.md](./05-ui-playground.md) | UI webview: sân chơi, luồng, kịch bản, từ điển |
| 6 | [06-extension-integration.md](./06-extension-integration.md) | Panel, command, message protocol (mirror XmlFlatPreview) |
| 7 | [07-implementation-plan.md](./07-implementation-plan.md) | Task checklist tuần tự (TDD) |
| 8 | [08-acceptance-checklist.md](./08-acceptance-checklist.md) | Checklist nghiệm thu tay trên `DHNDetail.xml` |
| — | [examples/dhn-formula-model.snippet.json](./examples/dhn-formula-model.snippet.json) | Fixture tham chiếu (rút gọn, viết tay) |

---

## Tư vấn đã chốt (đọc trước khi code)

### Vấn đề thật

Khối `g.$a` trên Grid (ví dụ `DHNDetail.xml` dòng ~269–315) là **sổ công thức**, không phải thứ tự chạy. Cùng một cột (`tien2`) có nhiều alias (`tien2_sl`, `tien2`, `tienmt_ty_le`). Thứ tự thật nằm ở `onChange` / `validExpression`. Hover hiện tại (`FormulaHover`) chỉ show 1 chuỗi JS — BA / non-tech không đọc được.

### Sản phẩm (không phải “pretty-print JS”)

Webview **giống XmlFlatPreview về cách mở** (command, panel Beside, refresh khi save) nhưng nội dung là **sân chơi tính tiền 1 dòng** + **luồng nghiệp vụ**. Người không biết code vẫn:

1. Gõ Số lượng / Giá nt / Tỷ lệ CK / tick Phí DV-TN.
2. Thấy Tiền, Chiết khấu, Thuế, Tổng thanh toán đổi ngay.
3. Ô vừa tính **nháy sáng** + câu tiếng Việt: *“Tiền hàng nt = Số lượng × Giá nt”*.

Bảng từ điển `g.$a.alias` chỉ là tab phụ (dành cho dev).

### Kiến trúc UI

- **Giống Flat Preview** = cách mở (command / Beside / refresh khi save) — **không** bắt buộc vanilla JS.
- **React + React Flow (`@xyflow/react`)** + **Webpack** → `media/bundle.js` (cùng pattern đóng gói webview như Preview Form).
- **Lý do chọn React** (không Preact/htm như Preview Form): `@xyflow/react` gắn React; đổi stack để có canvas kéo/zoom + auto-layout ổn định.
- **Auto-layout:** `dagre` (hoặc `@dagrejs/dagre`) tính tọa độ — không lưu x/y thủ công.
- **Theme:** biến `--vscode-*` cho nền canvas, node, edge (Dark/Light).
- **Pack VSIX (bắt buộc):** whitelist `!src/FormulaPreview/media/bundle.js` trong `.vscodeignore`; `build-package.js` chạy `npm run build:formula-preview` trước khi pack (giống `build:preview-form`). React/xyflow/dagre **chỉ** nằm trong bundle webview — không thêm vào production deps của VSIX.

### Parser tái sử dụng

- `extractGaDeclaration` + `buildFormulaMap` (`src/ReadXMLByJS/FormulaHover/`) — **mở rộng**, không copy-paste rồi bỏ.
- Flatten field/`<header>`: `XmlEntityExpander.expandXmlEntities`.
- Companion Dir (`DHNDetail.xml` → `Dir/DHNTran.xml`) chỉ để lấy nhãn tổng `t_*` / `ty_gia`.

### MVP vs sau này

| In MVP | Không làm MVP |
|--------|----------------|
| 1 dòng playground theo **kịch bản đang chọn** | Mô phỏng `calcGiaDvtn` (SUM chéo dòng) |
| Parse `onChange` `case 'field'` → list `g.$a.xxx` | `ResponseComplete`, `Currency.create` trên Dir |
| Aggregate 2 phần tử `['t_ck_nt','ck_nt']` | Interpreter JS tùy ý ngoài grammar expression |
| Aggregate 3 phần tử (điều kiện `loai`) — parse + hiện chữ, playground 1 dòng **bỏ filter** (ghi chú) | Sửa XML từ preview |
| Entity `&VoucherGoodsTypeFomulaGrid;` đã flatten | Pixel-perfect clone form FBO |
| React Flow canvas tương tác click node ↔ playground | Vẽ toàn bộ mạng nhện g.$a cùng lúc |

---

## Pipeline tổng quan

```
Grid XML (buffer)
    ├─ XmlEntityExpander          → flat_xml  (fields + header)
    ├─ extractGaDeclaration       → ga_block  (g.$a đã flatten entity)
    ├─ buildFormulaMap + AST      → entries
    ├─ parseOnChangeScenarios     → scenarios
    └─ resolve companion Dir      → master field labels
                ↓
          FormulaModel (JSON)
                ↓
     FormulaPreviewPanel.postMessage
                ↓
     Webview React + React Flow (Playground + Canvas Flow + Scenarios + Dictionary)
```

---

## Cấu trúc code đề xuất

```
src/FormulaPreview/
  index.js
  FormulaPreviewCommand.js
  FormulaPreviewPanel.js
  parser/
    FieldCatalogParser.js      # <field> → {name, header_v, type, hidden, boolean}
    FormulaAstParser.js        # '[thue_nt]:=...' → AST + plain_vi
    ScenarioParser.js          # onChange switch → scenarios
    FormulaModelBuilder.js     # ghép FormulaModel
  media/
    preview.html               # host shell nạp bundle.js
    bundle.js                  # output của webpack
    bundle.js.map
    src/                       # source code React
      App.jsx
      components/
        PlaygroundHero.jsx     # Sân chơi nhập/tính 1 dòng
        FormulaFlowCanvas.jsx  # React Flow canvas + Dagre layout
        ScenarioTab.jsx        # Danh sách kịch bản
        DictionaryTab.jsx      # Bảng từ điển alias
        RawFormulaTab.jsx      # Raw g.$a debug
        CustomNodes/
          FieldNode.jsx        # Node field input/computed
          AggregateNode.jsx    # Node tổng dồn Σ
      hooks/
        useFormulaEvaluator.js # Evaluator tính toán số liệu
      styles/
        preview.css            # Custom styling & VS Code theme tokens
  tests/
    FormulaAstParser.test.js
    GaFormulaMapBuilder.aggregate.test.js
    ScenarioParser.test.js
    FormulaModelBuilder.test.js
```

Mở rộng (không xóa API cũ):

```
src/ReadXMLByJS/FormulaHover/GaFormulaMapBuilder.js   # parse aggregate 2/3 phần tử
src/ReadXMLByJS/FormulaHover/GaDeclarationExtractor.js
```

---

## Quyết định đã chốt (không đổi)

1. **Command:** `fbo-autocomplete.previewFormula` — title `Preview Công thức`.
2. **File hỗ trợ MVP:** `Grid/*.xml` có `g.$a`. Path khác → message + không mở.
3. **Panel:** `ViewColumn.Beside`, singleton theo file (giống XmlFlatPreview).
4. **Live:** save file nguồn / DTD dưới `controllers` → refresh; debounce `onDidChangeTextDocument` 400ms.
5. **Playground không chạy tất cả alias** — chỉ chuỗi của kịch bản đang active (tránh vòng `gia_nt_sl` ↔ `tien_nt2_sl`).
6. **Nhãn UI:** `header_v` → `header_e` → `name`. Ẩn `hidden="true"` mặc định, có toggle.
7. **Test pattern:** `assert` + `function run()` + `require.main === module && run()` (giống Preview Form / XmlFlatPreview).
8. **Fixture vàng:** `DHNDetail.xml` (CNNB / FBISP229) — khối `g.$a` user đã gắn + `onChange$GridVoucherDetail$`.
9. **Webview stack:** React + `@xyflow/react` + dagre + webpack `bundle.js` (không vanilla; không Preact).
10. **Ship:** chỉ `bundle.js` (đã build) vào VSIX; host code FormulaPreview được webpack vào `src/dist/extension.js` qua `require` từ `extension.js`.
11. **Nguyên tắc đóng gói Module Độc Lập (Bắt buộc):** 
   - Toàn bộ logic (Command, Panel, Parser, Evaluator, Webview Media, Tests) **nằm trọn vẹn trong folder mới `src/FormulaPreview/`**.
   - `src/extension.js` **CHỈ nhúng nhẹ đúng 2 dòng** (`const { registerFormulaPreview } = require('./FormulaPreview');` và `registerFormulaPreview(context);` trong hàm `activate`).
   - **Tuyệt đối KHÔNG** code lồng logic tính toán hay gắn cờ trực tiếp vào các file cũ (`extension.js`, `XmlFlatPreview`, `PreviewForm`...) để đảm bảo tính độc lập, dễ bảo trì và dễ mở rộng.

---

## Định nghĩa Done (toàn feature)

- [ ] Command mở panel Beside trên `Grid/*.xml` có `g.$a`.
- [ ] DHN: sân chơi tính đúng path NT (`so_luong`/`gia_nt` → tiền → CK → thuế → tổng).
- [ ] Tick `phi_dvtn_yn` đổi nhánh tiếng Việt + số (theo formula `tien_mthang_*` / `s5`).
- [ ] Tab Kịch bản: sửa `so_luong` liệt kê đúng chuỗi alias (có `concat` helper thì expand tên hàm hoặc list đã resolve).
- [ ] Entity `&VoucherGoodsTypeFomulaGrid;` xuất hiện trong từ điển (nếu entity không rỗng).
- [ ] Unit test parser pass; checklist 08 pass trên DHNDetail.
