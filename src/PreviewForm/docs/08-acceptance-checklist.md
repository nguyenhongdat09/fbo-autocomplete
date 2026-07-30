# 08 — Acceptance Checklist

Dùng file Dir thực tế (ưu tiên `TNTran.xml` hoặc Dir có đủ general + multi-tab + grid + footer `-1`).

Môi trường: Extension Development Host sau khi build `bundle.js`.

---

## 0. Design fidelity (mục đích chính)

- [ ] Sửa pattern / columns / categoryIndex trên XML → preview đổi đúng theo khai báo (không tự “làm đẹp”).
- [ ] Cố ý sai (pattern ngắn hơn columns, width `0`, quên categoryIndex) → **thấy rõ** trên preview / warnings — đủ để Developer biết chỗ sửa.
- [ ] Không hiện field thuộc cột columns=`0`; không dồn gap `-` thành layout full trái.

## A. Mở & phạm vi

- [ ] Command `FBO: Preview Form` xuất hiện trong submenu FBO / Command Palette.
- [ ] Với file `Dir/*.xml`: panel `Form Preview: {file}` mở Beside.
- [ ] Với file không phải Dir: thông báo chặn / không mở preview sai.
- [ ] Mở lại cùng file: reuse panel (không nhân đôi vô hạn).

## B. Flatten & parse

- [ ] Entity (`&ListView;`, `&PostCategory;`, …) đã expand — tab/field từ entity vẫn hiện.
- [ ] Cụ thể: field/tab từ `&PostField;` / `&PostView;` / `&PostCategory;` (nếu có trong file test) xuất hiện trong preview — **không** bị thiếu do entity chưa resolve.
- [ ] Cụ thể: `&ListView;` expand ra fields List chuẩn → hiện trong section General hoặc tab đúng.
- [ ] Nếu thiếu entity: banner warning, panel không trắng/crash.
- [ ] So nhanh với `XML Flat Preview`: cùng file không mâu thuẫn entity missing nghiêm trọng.

## C. Thông tin chung (header)

- [ ] Field **không** `categoryIndex` nằm trên cùng (vd Cửa hàng, Loại SC, Mã khách, Trạng thái…).
- [ ] `status` dạng dropdown, có option kiểu “4. Đã báo giá”.
- [ ] Checkbox Boolean hiện được (vd Ngoài hệ thống / tương đương).
- [ ] DateTime hiện control date/text.
- [ ] `readOnly="true"` (nếu có): **plain text**, không `vscode-text-field`.
- [ ] `disabled="true"` (vd `ma_nv_tn`, `tiep_nhan_yn`): hiện field với **opacity mờ** (~0.55), phân biệt với enabled field.
- [ ] Grid field có `<label v="...">` (vd `zcdtndgscSPTN`): tên tab/placeholder lấy từ `label_v` khi `header_v` rỗng — không hiện rỗng.
- [ ] `[field%l]` / tên kèm: plain text cạnh control.
- [ ] Layout hàng theo pattern: label/control/gap hợp lý (không mọi field full-width loạn).

## D. Tabs

- [ ] Tab titles theo **thứ tự khai báo** categories (vd 1.1 rồi 1.2…) — **không** sort theo số index tăng dần nếu XML khai báo khác.
- [ ] Click tab đổi nội dung đúng `rows_by_category[index]`.
- [ ] Tab có Grid (vd category 2 / `zcdtndgsc`): hiện placeholder **`zcdtndgsc_Grid`** (không bảng chi tiết).
- [ ] `view/@height` áp dụng cho vùng tab (scrollbar nếu dài).
- [ ] Nếu cố ý giảm `height` nhỏ: có **cảnh báo tràn** (banner/notice).

## E. Sticky footer

- [ ] Field `categoryIndex="-1"` (Số lượng linh kiện, Tiền linh kiện…) nằm **dưới** tabs.
- [ ] Đổi tab khác → footer **vẫn hiện** cùng giá trị/layout.
- [ ] Footer không nằm trong `vscode-panel-view` đang ẩn.

## F. Label / Description

- [ ] `[x].Label` lấy `header/@v`.
- [ ] `[x].Description` lấy `footer/@v`, style chữ (vd Ý kiến khách hàng), không input.

## G. Live preview

- [ ] Sửa một `item value` pattern trên general → sau ~400ms preview cập nhật (buffer chưa save).
- [ ] Save file → preview refresh.
- [ ] Save DTD/entity liên quan (nếu đổi) → preview refresh.
- [ ] Đổi tab active rồi XML refresh → không crash (tab index clamp nếu số tab giảm).

## H. Warnings

- [ ] Pattern length ≠ columns → warning hiển thị, vẫn render phần được.
- [ ] Ref field không tồn tại → warning / `[missing:…]`, không exception host.

## I. Non-goals (xác nhận không làm thừa)

- [ ] Không gọi API/DB.
- [ ] Không chạy `clientScript` FBO.
- [ ] Không render cột grid chi tiết.

---

## Kết quả

| Ngày | File XML test | Pass/Fail | Ghi chú |
|------|---------------|-----------|---------|
| | | | |

Khi **A–H** pass → MVP Preview Form đạt Done theo [01-requirements.md](./01-requirements.md).
