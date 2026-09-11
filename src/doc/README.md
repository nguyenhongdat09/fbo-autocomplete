# Tài liệu chức năng mới — cho Gemini

Thư mục này chứa **đặc tả triển khai** các tính năng extension `fbo-autocomplete` viết cho agent (Gemini). Đọc README của từng feature rồi làm theo thứ tự file đánh số.

| Feature | Thư mục | Một câu |
|---------|---------|---------|
| **Preview Công thức (`g.$a`)** | [formula-preview/](./formula-preview/README.md) | Webview giống Preview Flat XML, nhưng **trình diễn công thức lưới** sao cho BA / non-tech hiểu được |
| **Thiết kế Lấy dữ liệu FlowMulti** | [retrieve-flow/](./retrieve-flow/README.md) | Wizard generate 4 XML Retrieve + SQL temp (proc, fsd_addFields, sysfilter) — partitioned / single |
| **Fix sau review (Formula Preview)** | [doc_fix/](./doc_fix/README.md) | Prompt FIX blocker (ScenarioParser, CDATA alias, recalc, pack/test) — đưa Gemini sửa tiếp |
| **Fix sau review (Retrieve Flow)** | [doc_fix_flow/](./doc_fix_flow/README.md) | UX + Detail snippet `/**/`; status Finding; sysfilter default; bỏ dest_qty/role |
| **Convert Excel From Upload** | [doc_convert_excel_to_upload/](./doc_convert_excel_to_upload/README.md) | Upload XML legacy → lookup Dir/Grid header → xuất `upload_chuan.xlsx` (dòng 5, `*` đỏ) |
| **Convert XML từ `.f`** | [doc_convert_xml/](./doc_convert_xml/README.md) | Menu Convert XML trên `.f` (tree + explorer), chặn ghi đè |
| **Fix Convert XML (decrypt)** | [doc_fix_convert_xml/](./doc_fix_convert_xml/README.md) | BLOCKER: không copy `.f`→`.xml`; phải giải mã `<Encrypted>` + Key/IV + test |
| **Refactor ContextMenu** | [doc_refactor_context_menu/](./doc_refactor_context_menu/README.md) | Tách `ContextMenu.js` → `ContextMenuActions/*`; entry mỏng; không đổi `fboFile.*` |

Preview Form (layout Dir) vẫn nằm ở `src/PreviewForm/docs/` — không chuyển vào đây.

