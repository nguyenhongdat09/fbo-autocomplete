# Thiết kế Lấy dữ liệu FlowMulti — Tài liệu triển khai cho Gemini

Bộ tài liệu mô tả **đầy đủ** tính năng **Retrieve Flow Designer** của extension `fbo-autocomplete`: mở Webview VS Code **cạnh editor**, wizard nhập tham số động → generate **4 XML Controllers** (FlowMulti) + **1 file `.sql` temp** (proc, `fsd_addFields`, sysfilter, snippet Tran/Detail).

> **Phạm vi docs:** đặc tả + kế hoạch implement. Agent đọc theo thứ tự bên dưới rồi code. Không hỏi lại các quyết định đã chốt.

---

## Cách đọc (bắt buộc theo thứ tự)

| # | File | Nội dung |
|---|------|----------|
| 1 | [01-requirements.md](./01-requirements.md) | Mục tiêu, user stories, non-goals, Done |
| 2 | [02-domain-model.md](./02-domain-model.md) | FormInput JSON, quy ước `$`, so sánh partitioned vs single |
| 3 | [03-xml-templates.md](./03-xml-templates.md) | 2 bộ template + placeholder map |
| 4 | [04-sql-generator.md](./04-sql-generator.md) | Proc, fsd_addFields, sysfilter, snippet Tran/Detail |
| 5 | [05-ui-webview.md](./05-ui-webview.md) | Wizard form, validation, preview, Generate |
| 6 | [06-extension-integration.md](./06-extension-integration.md) | Panel, command, message protocol, ghi file |
| 7 | [07-implementation-plan.md](./07-implementation-plan.md) | Task checklist tuần tự (TDD) |
| 8 | [08-acceptance-checklist.md](./08-acceptance-checklist.md) | Nghiệm thu YCNDXA + zcWIMO |

Templates (runtime, pack VSIX): [`src/Database/RetrieveFlowTemplates/`](../../Database/RetrieveFlowTemplates/) — `partitioned/`, `single/`, `BeforeAfterUpdate.sql.tpl`

---

## Quyết định đã chốt

| Hạng mục | Chốt |
|----------|------|
| Pattern | **FlowMulti 1–n** — không làm Form/Grid 1–1 |
| Bảng nguồn | **2 mode:** `partitioned` (có `$`, YCNDXA) + `single` (không `$`, zcWIMO) |
| 4 XML | Ghi thẳng `Controllers/{Filter\|Grid\|Lookup}/`, overwrite modal 1 lần (xem 05) |
| Detail / Tran | Snippet bọc `/**/` trong `.sql` — **không** auto-sửa XML |
| SQL temp | `fbo-autocomplete.sqlTempFolder` (giống `NewSqlTemp`) — **chưa deploy** |
| Mở webview | Giống Preview XML Flat: command + Beside |
| **Kiến trúc** | **`src/RetrieveFlow/` folder riêng** — `extension.js` chỉ 2 dòng; tận dụng helper có sẵn |
| **Template `.tpl`** | [`src/Database/RetrieveFlowTemplates/`](../../Database/RetrieveFlowTemplates/) — runtime + pack VSIX |
| Derive partitioned | `src_d_table`, `src_m_prefix`, `src_i_prefix` **derive on-the-fly** qua `deriveFormInput()` — không lưu JSON |
| Preview | **Host roundtrip** (`preview` / `previewResult`) — webview không đọc `.tpl` |
| Overwrite | **1 modal:** Ghi đè tất cả / Bỏ qua file có sẵn / Hủy |
| `queryFilterString` | **Hardcode trong template** theo mode — không field FormInput |
| `controllers_root` | `AppDataPathHelper` (UNC OK) → optional setting → error |
| SQL temp thiếu folder | Vẫn ghi 4 XML; skip SQL + toast cảnh báo |

---

## Nguyên tắc kiến trúc (bắt buộc)

1. **Folder riêng `src/RetrieveFlow/`** — command, panel, generator, webview, tests.
2. **`extension.js` chỉ 2 dòng** — `require('./RetrieveFlow')` + `registerRetrieveFlow(context)`.
3. **Không trộn** logic vào TreeFile, XmlFlatPreview, FormulaPreview, ContextMenu.
4. **Tận dụng** `AppDataPathHelper`, pattern panel XmlFlatPreview, `createSqlTempFile` (extract từ ContextMenu) — chi tiết [06-extension-integration.md](./06-extension-integration.md).

---

## Fixture vàng

| Mode | Project | Bộ file |
|------|---------|---------|
| partitioned | EPLUS FBISP24 | `YCNDXAFilter`, `YCNDXAMultiForm`, `YCNDXAMultiGrid`, `YCNDXALookup` |
| single | LIKSIN FBISP23 | `zcWIMOFilter`, `zcWIMOMultiForm`, `zcWIMOMultiGrid`, `zcWIMOLookup` |

---

## Pipeline

```
Command → RetrieveFlowPanel (Beside)
       → Webview wizard (FormInput)
       → Generator (template partitioned | single)
       → 4 XML → Controllers/
       → 1 .sql → sqlTempFolder
```
