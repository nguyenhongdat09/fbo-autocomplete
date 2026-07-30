# 01 — Requirements: Preview Form

## Mục tiêu

Developer chỉnh layout form FBO trong `Dir/*.xml` (fields + view pattern + categories) cần **xem trước nhanh** trong VS Code, không phải mở Chrome + F5 mỗi lần.

**Mục đích chính:** Preview là **gương phản chiếu quy tắc thiết kế FBO** (pattern / columns / categoryIndex / height / ẩn cột width `0`…). Developer nhìn preview → **thấy lỗi khai báo ở đâu** → sửa lại XML. Preview **không** được “sửa giúp” hay xấp xỉ layout cho đẹp mà che mất tín hiệu lỗi.

Skin dùng Preact + VS Code Webview UI Toolkit (khác WinForms) — nhưng **cấu trúc cột/zone/tab phải tuân thủ domain rules 1:1**.

## User stories

1. **Mở preview:** Khi đang mở file `Dir/*.xml`, tôi chạy command **Preview Form** → panel Webview mở bên cạnh, render form từ XML (sau khi flatten entity).
2. **Live edit:** Khi tôi sửa pattern / categoryIndex / field trong editor (kể cả chưa save), sau ~400ms preview cập nhật; khi save file hoặc DTD liên quan, preview refresh chắc chắn.
3. **Phát hiện lỗi thiết kế:** Tôi thấy cột theo `columns` px và pattern `1`/`0`/`-` **đúng như đã khai báo** (kể cả khi sai → lệch/tràn/ẩn); biết field thuộc tab nào, footer sticky; column width `0` thì field biến mất — để tôi sửa XML theo skill `fbo-design-view-field`.

## Phạm vi MVP (in-scope)

| Hạng mục | Chi tiết |
|----------|----------|
| File | `Dir/*.xml` có `<view id="Dir">` |
| Flatten | Tất cả `&Entity;` qua `XmlEntityExpander` |
| Zones | Thông tin chung (no categoryIndex), Tabs, Sticky footer (`categoryIndex="-1"`) |
| Field kinds | Input, DropDownList, Boolean/Checkbox, DateTime/Date, Grid placeholder |
| View refs | `[name]`, `[name].Label`, `[name].Description`, `[name%l]` (tên lookup — render như text/readonly kèm field) |
| readOnly | `readOnly="true"` → plain text, không input box |
| Height | `view/@height` = chiều cao vùng **tab**; banner nếu nội dung tràn |
| UI kit | `@vscode/webview-ui-toolkit` |

## Non-goals (out-of-scope MVP)

- Không chạy JavaScript FBO (`onChange`, `clientScript`, request/API).
- Không load dữ liệu database / lookup thật.
- Không render nội dung Grid chi tiết (cột, toolbar, rows) — chỉ placeholder `{fieldName}_Grid`.
- Không hỗ trợ Grid XML / Filter XML / Report trong MVP.
- Không pixel-perfect clone WinForms FBO (màu, font hệ thống cũ).
- Không edit XML từ preview (preview read-only).
- Không resolve entity bên trong CDATA script trừ khi expander đã làm (dùng API expander mặc định giống XmlFlatPreview).

## Hành vi khi file không hợp lệ

| Tình huống | Hành vi |
|------------|---------|
| Không phải path Dir / không có view Dir | Hiển thị thông báo rõ trong panel |
| XML parse lỗi sau flat | Panel hiện error + stack ngắn; không crash extension |
| Pattern length ≠ số cột | Warning trong banner; vẫn cố render theo min(length) |
| Field trong view không có `<field>` | Warning; ô trống / text `[missing:name]` |
| Entity còn `MISSING` sau expand | Warning liệt kê; parser vẫn chạy trên flat_text |

## Tiêu chí chấp nhận (tóm tắt)

Chi tiết tay: [08-acceptance-checklist.md](./08-acceptance-checklist.md).

Với file kiểu TNTran:

1. Phần trên: các field không có `categoryIndex` (Cửa hàng, Loại SC, Mã khách, …).
2. Tabs theo **thứ tự khai báo** trong `<categories>` (1.1, 1.2, …) — **không** sort theo số `index`.
3. Tab chứa Grid → hiện ví dụ `zcdtndgsc_Grid`.
4. Footer sticky: field `categoryIndex="-1"` (Số lượng linh kiện, …) vẫn hiện khi đổi tab.
5. Dropdown `status` có options từ `<items style="DropDownList">`.
6. `readOnly` / Description: dạng chữ, không ô input toolkit.

## Command & UX

- **Command id:** `fbo-autocomplete.previewForm`
- **Title (gợi ý):** `FBO: Preview Form`
- **Menu:** submenu FBO (editor context) + editor title khi `resourceExtname == .xml` (có thể thêm when clause path Dir nếu khả thi)
- **Panel title:** `Form Preview: {fileName}`
- **ViewColumn:** Beside

## Tham chiếu hình / XML mẫu

- Layout thực tế: chứng từ TN (header + multi-tab + footer sticky).
- XML: `Dir/TNTran.xml` — `<fields>`, `<view id="Dir" height="..." ...>`, `<categories>`.
