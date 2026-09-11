# 01 — Requirements: Preview Công thức

## Mục tiêu

BA / tester / dev mở `Grid/*Detail.xml`, cần **nhìn công thức tiền** (`g.$a`) như đang gõ 1 dòng trên phiếu — không đọc chuỗi `'[tien_nt2]:=[so_luong]*[gia_nt]'`.

**Mục đích chính:** Webview là **máy tính minh họa**, không phải editor XML. Người non-tech hiểu *khi đổi Số lượng thì Tiền / Thuế / Tổng đổi vì sao*. Dev vẫn có tab từ điển alias.

Cách mở **giống Preview XML Flat**: command trên file XML đang focus, panel Beside, refresh khi lưu.

## User stories

1. **Mở preview:** Đang mở `Grid/DHNDetail.xml` → command **Preview Công thức** → panel cạnh editor, thấy sân chơi 1 dòng với nhãn tiếng Việt (`Số lượng`, `Giá nt`, `Tiền hàng nt`…).
2. **Chơi số:** Đổi Số lượng / Giá nt / Tỷ lệ CK / Tỷ giá / Thuế suất → các ô tính **cập nhật ngay**, ô vừa đổi **nháy**, dưới ô có 1 câu tiếng Việt.
3. **Nhánh điều kiện:** Tick **Phí DV-TN** → thấy tiền hàng dòng đi sang nhánh phí (theo `phi_dvtn_yn`), không cần đọc ternary.
4. **Kịch bản:** Chọn “Khi sửa Số lượng” → thấy thứ tự bước FBO thật (`tien_nt2_sl` rồi `tien2` rồi CK rồi thuế…).
5. **Live edit:** Sửa `g.$a` trên XML (kể cả chưa save) → sau ~400ms playground/từ điển cập nhật; save file hoặc DTD → refresh chắc.

## Phạm vi MVP (in-scope)

| Hạng mục | Chi tiết |
|----------|----------|
| File | `Grid/*.xml` chứa `g.$a = {` (sau flatten entity) |
| Flatten `g.$a` | `extractGaDeclaration` — kể cả `&VoucherGoodsTypeFomulaGrid;` giữa object |
| Nhãn cột | `<field name>` + `<header v/e>` trên Grid đã flatten |
| Nhãn tổng / tỷ giá | Companion `Dir/{prefix}Tran.xml` nếu tìm được (DHNDetail → DHNTran) |
| Expression | Grammar FBO trong chuỗi `'[target]:=...'` (xem 02) |
| Aggregate | `['master','grid_col']` và `['master','[col]','filter']` |
| Scenarios | `switch (name) { case 'x': ... g.$a.alias ...}` |
| Playground | 1 dòng + field master tổng; chỉ chạy chain kịch bản active |
| UI | React + React Flow (`@xyflow/react`) + Dagre; webpack `media/bundle.js` |
| Pack | Whitelist bundle trong `.vscodeignore` + build trong `build-package.js` |
| Command | `fbo-autocomplete.previewFormula` |

## Non-goals (out-of-scope MVP)

- Không chạy JS FBO thật (`calcGiaDvtn$...`, `setItemGridBehavior`, request Tax).
- Không giả lập nhiều dòng / SUM chéo dòng.
- Không `ResponseComplete`, không `Currency.create` / `set_executeExpression` trên Dir.
- Không Preview Form / không render layout view.
- Không cho sửa XML từ webview.
- Không pixel-perfect clone grid FBO.
- Không eval JS tùy ý ngoài grammar expression (không `new Function` trên cả file script).

## Hành vi khi file không hợp lệ

| Tình huống | Hành vi |
|------------|---------|
| Không phải path Grid | Message: chỉ hỗ trợ `Grid/*.xml` — không mở panel |
| Không tìm thấy `g.$a` | Panel mở, banner “Không tìm thấy khai báo g.$a” + gợi ý hover/script |
| XML/entity lỗi | Banner warning (thiếu entity); playground dùng phần parse được |
| Expression không parse | Entry `kind: 'unknown'`; playground bỏ qua; từ điển hiện raw |
| Không có companion Dir | Master label = `t_tt` / `ty_gia` (tên field); không crash |

## Tiêu chí chấp nhận (tóm tắt)

Chi tiết: [08-acceptance-checklist.md](./08-acceptance-checklist.md).

Với **DHNDetail.xml**:

1. Sân chơi có Số lượng, Giá nt, Tiền hàng nt, Tỷ lệ CK, Chiết khấu, Thuế suất, Thuế, Tỷ giá, Tổng thanh toán.
2. Demo: `so_luong=10`, `gia_nt=100000`, `ty_gia=1`, `tl_ck=5`, `thue_suat=10`, `phi_dvtn_yn=0` → `tien_nt2=1_000_000`, `ck_nt=50_000`, `thue_nt=95_000` (thuế trên tiền sau CK).
3. Câu dưới ô Tiền hàng nt dạng: *Tiền hàng nt = Số lượng × Giá nt*.
4. Kịch bản `so_luong` chứa `tien_nt2_sl`, `tien2`, `ck_nt`, `thue_nt` (và nhóm phí nếu parser expand `row_phi`).

## Command & UX

- **Command id:** `fbo-autocomplete.previewFormula`
- **Title:** `Preview Công thức`
- **Menu:** submenu FBO + `editor/title` khi `resourceExtname == .xml` (cạnh Preview XML Flat / Preview Form)
- **Icon:** `$(symbol-operator)` hoặc `$(open-preview)` — không trùng tooltip với Flat Preview
- **Panel title:** `Công thức: {fileName}`
- **ViewColumn:** Beside
- **Dirty file:** giống XmlFlatPreview — hỏi Lưu và Preview / Preview từ đĩa / hủy

## File mẫu bắt buộc khi làm

`Grid/DHNDetail.xml` (đường dẫn user: `...\FBISP229\App_Data\Controllers\Grid\DHNDetail.xml`).

Khối vàng: `g.$a` ~ dòng 269–315 + `onChange$GridVoucherDetail$` ~ 414–482.
