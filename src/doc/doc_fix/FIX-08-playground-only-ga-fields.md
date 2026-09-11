# FIX-08 — Sân chơi chỉ hiện field tham gia `g.$a` (không dump cả Grid)

## Mức: High (UX — user vừa phản hồi screenshot)

## Hiện tượng

Hero “Sân chơi tính toán mẫu” **liệt kê mọi `<field>`** của Grid.

Cột Hạch toán hiện cả ô trống không liên quan công thức:

- Tk doanh thu, Tên tài khoản, Đvt, Loại, Tk chiết khấu, Mã thuế, Tk thuế, Cục thuế, Diễn giải, Vụ việc, SL đồng hồ nước, Phí BVMT, Phí TL, …

User **chỉ** muốn các cột **tham gia tính** trong khối `g.$a` (DHN ~270–314, sau flatten entity).

Nguyên nhân: `PlaygroundHero.jsx` duyệt `Object.keys(model.fields)` (catalog Grid), không lọc theo `entries`.

---

## Rule (bắt buộc)

Tập field hiện trên Hero = **union** từ `model.entries` (toàn bộ sổ `g.$a`, không chỉ `default_demo_chain`):

| Nguồn | Lấy tên field |
|--------|----------------|
| `kind === 'formula'` | `target` + `refs[]` (`ty_gia` từ `[$ty_gia]`) |
| `kind === 'aggregate' / 'aggregate_filter'` | `grid_col` (cột dòng). `master` (`t_*`) **không** nhét 2 cột Hero — để thanh tổng dưới |

Luôn thêm nếu có trong catalog/seed: `ty_gia` (ô header Hero đã có thì không lặp trong cột).

**Cấm hiện** dù có trong Grid XML: `tk_dt`, `ten_tk%l`, `dvt`, `loai`, `dien_giai`, `ma_thue`, `tk_thue`, `ma_kh2`, `s4`, `phi_bvmt_yn`, `phi_tl_yn`, `stt_rec`, … — trừ khi tên đó thật sự xuất hiện trong `g.$a`.

Ví dụ DHN **được** hiện (nhãn XML):

**Nguyên tệ / input dòng:** `so_luong`, `gia_nt`, `tien_nt2`, `tl_ck`, `ck_nt`, `thue_suat`, `thue_nt`, `tienmt_nt`, `tien_mthang_nt`, `thue_dvtn_nt`, `s5` (nếu trong entries), `phi_dvtn_yn`

**Hạch toán:** `gia`, `tien2`, `ck`, `thue`, `tienmt`, `tien_mthang`, `thue_dvtn`, `ty_le` **chỉ khi** `ty_le` nằm trong refs/target của entries (trong 270–314 **không** có `[ty_le]` → **không hiện** `ty_le` trên Hero). `phi_bvmt_yn` / `phi_tl_yn` **không** có trong `g.$a` → **không hiện**.

Hidden XML (`tien_mthang_nt`, …): mặc định **ẩn**; checkbox **Hiện cột ẩn** mới show (giữ hành vi cũ, nhưng vẫn chỉ field trong tập tham gia).

Master `t_tt`, `t_ck_nt`, …: chỉ thanh **Tổng** dưới Hero, không lặp full list 2 cột.

---

## Sửa code

`PlaygroundHero.jsx`:

```js
function participatingGridFields(model) {
  const names = new Set();
  for (const e of model.entries || []) {
    if (e.target) names.add(e.target);
    (e.refs || []).forEach(r => names.add(r));
    if (e.grid_col) names.add(e.grid_col);
    // không add e.master vào 2 cột
  }
  names.delete('ty_gia'); // đã có trên header
  return names;
}
```

Chia NT/HT **chỉ** trong set này + `fields[name]` để lấy header/type.

Thứ tự gợi ý: `so_luong`, `gia_nt`, `tien_nt2`, `tl_ck`, `ck_nt`, `thue_suat`, `thue_nt`, `phi_dvtn_yn`, rồi phí; cột phải `gia`, `tien2`, `ck`, `thue`, … (không sort alphabet dump Grid).

**Canvas:** filter node cùng rule khi `selectedGroup === 'all'` — không tạo node từ field catalog ngoài `entries`.

**Không** đổi parser `g.$a`; không hiện lại tab onChange.

---

## Done (đối chiếu screenshot user)

- [ ] Cột Hạch toán **không** còn Tk doanh thu / Đvt / Mã thuế / Diễn giải / Vụ việc / SL đồng hồ nước / Phí BVMT / Phí TL khi các tên đó không có trong `g.$a`
- [ ] Còn Số lượng, Giá nt, Tiền hàng nt, CK, Thuế, Phí DV-TN, Tiền, …
- [ ] `npm run build:formula-preview`
- [ ] Smoke DHN: Hero gọn, diễn giải vẫn đọc được

## Không làm

- Không ẩn field khỏi **Từ điển g.$a** / **Nhóm công thức** / **Raw** (vẫn full sổ)
- Không bắt user bật “Hiện cột ẩn” để thấy input chính (`so_luong`, …)
