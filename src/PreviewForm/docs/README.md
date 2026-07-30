# Preview Form — Tài liệu triển khai cho Agent (Gemini)

Bộ tài liệu này mô tả **đầy đủ** tính năng **Preview Form** của extension `fbo-autocomplete`: xem trước layout form `Dir/*.xml` FastBusiness FBO trong Webview VS Code, dùng **Preact + `@vscode/webview-ui-toolkit`**, cập nhật live khi chỉnh XML.

> **Phạm vi docs:** đặc tả + kế hoạch implement. Agent đọc theo thứ tự bên dưới rồi code. Không cần hỏi lại các quyết định đã chốt.

---

## Cách đọc (bắt buộc theo thứ tự)

| # | File | Nội dung |
|---|------|----------|
| 1 | [01-requirements.md](./01-requirements.md) | Mục tiêu, user stories, non-goals, Done |
| 2 | [02-domain-rules.md](./02-domain-rules.md) | Quy tắc XML FBO: field types, tab, footer, pattern, height |
| 3 | [03-form-model.md](./03-form-model.md) | Schema JSON trung gian `FormModel` |
| 4 | [04-parser-spec.md](./04-parser-spec.md) | Spec parser: flat XML → FormModel |
| 5 | [05-ui-preact.md](./05-ui-preact.md) | Preact components + map Toolkit |
| 6 | [06-extension-integration.md](./06-extension-integration.md) | Panel, command, webpack, message protocol |
| 7 | [07-implementation-plan.md](./07-implementation-plan.md) | Task checklist tuần tự (TDD) |
| 8 | [08-acceptance-checklist.md](./08-acceptance-checklist.md) | Checklist nghiệm thu tay |
| — | [examples/tntran-form-model.snippet.json](./examples/tntran-form-model.snippet.json) | **Fixture tham chiếu** — FormModel rút gọn viết tay từ TNTran.xml. Dùng để đối chiếu khi viết test parser; **không** phải output auto-generate. Chỉ chứa một số field tiêu biểu. |

---

## Quyết định đã chốt (không đổi)

0. **Design fidelity (quan trọng nhất):** Preview tuân thủ quy tắc layout FBO gốc để Developer **nhìn lỗi khai báo rồi sửa XML**. Không xấp xỉ pattern/columns, không tự reorder, không hiện field cột width `0`. Skin Toolkit ≠ được phép phá cấu trúc. Xem [`../docs_fix/PRINCIPLE-design-fidelity.md`](../docs_fix/PRINCIPLE-design-fidelity.md).
1. **UI skin:** `@vscode/webview-ui-toolkit` + Preact (**không** bắt buộc giống pixel WinForms — chỉ khác skin).
2. **Live preview:** reload khi **save** file nguồn/DTD **và** debounce `onDidChangeTextDocument` (~400ms) trên buffer đang mở.
3. **MVP:** chỉ `Dir/*.xml` có `<view id="Dir">`. Grid/Filter → thông báo “chưa hỗ trợ”.
4. **Flatten entity:** tái sử dụng `XmlEntityExpander.expandXmlEntities` từ `src/ReadXMLByJS/XmlFlatPreview/`.
5. **Parser XML:** `fast-xml-parser`.
6. **Webview JS:** Preact + **htm** (không JSX), bundle webpack → `src/PreviewForm/media/bundle.js`.
7. **Command:** `fbo-autocomplete.previewForm`.

---

## Pipeline tổng quan

```
Dir XML  →  XmlEntityExpander  →  flat_text
                                      ↓
                               FormXmlParser
                                      ↓
                                  FormModel
                                      ↓
                             PreviewFormPanel (postMessage)
                                      ↓
                          Preact App + VS Code Toolkit
```

---

## Cấu trúc code đề xuất (khi implement)

```
src/PreviewForm/
  docs/                    ← thư mục này
  index.js                 ← register command
  PreviewFormCommand.js
  PreviewFormPanel.js
  parser/
    FormXmlParser.js
    classifyField.js
    parseViewItems.js
  media/
    index.html (hoặc HTML string trong Panel)
    bundle.js              ← output webpack
    previewForm.css
  tests/
    FormXmlParser.test.js
```

---

## Định nghĩa Done (toàn feature)

- [ ] Command mở panel Beside cho file Dir đang active.
- [ ] FormModel đúng: general / tabs (thứ tự khai báo) / sticky footer `-1`.
- [ ] Field types: Input, Dropdown, Checkbox, Date, Grid placeholder, Label, Description, readOnly text.
- [ ] Pattern `1`/`0`/`-` + `columns` px render thành CSS grid.
- [ ] `view height` áp vào vùng tab; cảnh báo nếu nội dung tràn.
- [ ] Live update: save + debounce change.
- [ ] Unit test parser pass; acceptance checklist (08) pass với TNTran (hoặc Dir tương đương).

---

## Tham chiếu codebase / skill

- Flat preview: `src/ReadXMLByJS/XmlFlatPreview/`
- Skill layout: `fbo-design-view-field` (pattern, columns, anchor, split)
- File mẫu nghiệp vụ: `Dir/TNTran.xml` (view + categories + fields)
