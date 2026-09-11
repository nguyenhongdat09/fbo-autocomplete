# 08 — Acceptance Checklist

Dùng `Grid/DHNDetail.xml` (ưu tiên path FBISP229 user đã mở). Extension Development Host.

---

## A. Mở & phạm vi

- [ ] Command **Preview Công thức** có trong submenu FBO / Command Palette / editor title.
- [ ] Mở trên `DHNDetail.xml` → panel `Công thức: DHNDetail.xml` Beside.
- [ ] Mở trên `Dir/*.xml` → bị chặn, không mở panel sai.
- [ ] Mở lại cùng file → reuse panel (không nhân đôi vô hạn).
- [ ] File dirty → hỏi Lưu / Preview từ đĩa / hủy.

## B. Flatten & model

- [ ] Có entries từ `g.$a` (không chỉ empty).
- [ ] Entity giữa object (`VoucherGoodsTypeFomulaGrid`) không làm vỡ parse (không còn `&Voucher...;` trong raw tab nếu entity expand được).
- [ ] Aggregate `t_tien_hang_nt` kind aggregate, grid_col `tien_mthang_nt`.
- [ ] Formula `tien_nt2_sl` có `plain_vi` tiếng Việt có chữ “Số lượng” hoặc “Giá” (không chỉ bracket).
- [ ] Thiếu entity → banner warning, panel không trắng.

## C. Sân chơi (hero)

- [ ] Seed mặc định: Số lượng 10, Giá nt 100000, Tỷ giá 1, TL CK 5, Thuế suất 10, Phí DV-TN tắt.
- [ ] Tiền hàng nt = **1,000,000** (cho phép format `1.000.000` / `1000000`).
- [ ] Chiết khấu nt = **50,000**.
- [ ] Thuế nt = **95,000** (= (1_000_000 − 50_000) × 10%).
- [ ] Tiền (hạch toán) = Tiền hàng nt × Tỷ giá (với ty_gia=1 → bằng nt).
- [ ] Đổi Số lượng → các ô phụ thuộc nháy / cập nhật.
- [ ] Caption dưới ô giải thích bằng tiếng Việt.
- [ ] Tick Phí DV-TN → nhánh `tien_mthang_*` / `s5` đổi đúng formula (tiền hàng dòng → 0 khi là phí; phí hiện theo rule DHN).
- [ ] Toggle “Hiện cột ẩn” hiện thêm field hidden (vd `tien_mthang_nt`).

## D. Kịch bản & luồng (React Flow)

- [ ] Có scenario **Khi sửa Số lượng** với chuỗi gồm `tien_nt2_sl`, `tien2`, `ck_nt`, `thue_nt` (và phí nếu expand được).
- [ ] Scenario **Khi sửa Giá** dùng nhánh `tien2_sl` (không bắt buộc bằng path NT).
- [ ] Cảnh báo `extra_js` nếu case gọi `calcGiaDvtn` (không cần mô phỏng đúng số chéo dòng).
- [ ] Canvas React Flow hiện node field + cạnh theo **scenario đang chọn** (không vẽ hết mọi alias `g.$a`).
- [ ] Đổi scenario → layout Dagre chạy lại + `fitView` (không chồng node).
- [ ] Click node trên canvas focus/highlight ô playground tương ứng (và ngược lại nếu đã làm).
- [ ] Edge bước vừa tính có `animated` / đổi màu; `prefers-reduced-motion` không spam animation.

## E. Từ điển & raw

- [ ] Bảng alias tìm được `thue_nt`, `t_tt_nt`.
- [ ] Tab raw copy được khối g.$a.
- [ ] Click Refresh / phím R cập nhật sau khi sửa XML (debounce hoặc save).

## F. Regression

- [ ] Preview XML Flat vẫn mở.
- [ ] Preview Form vẫn mở trên Dir.
- [ ] Hover `g.$a.tien_nt2_sl` trên Grid vẫn hiện codeblock.

## G. Non-goals (xác nhận không làm nhầm)

- [ ] Không giả lập nhiều dòng / giá DV-TN lấy từ dòng khác.
- [ ] Không sửa XML từ panel.
- [ ] Không mở được “playground” trên file không có Grid path.
