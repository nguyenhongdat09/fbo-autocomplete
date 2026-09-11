# FEAT-06 — Thu hẹp scope: chỉ trình diễn khối `g.$a` (không cần onChange / validExpression)

## Quyết định sản phẩm (user chốt)

**Mục đích Preview Công thức:** giúp người dùng (kể cả non-tech) **đọc và hiểu** các trường tính toán trong sổ `g.$a` liên quan nhau thế nào.

**Phạm vi phân tích đủ:** đúng khối khai báo `g.$a = { … }` (sau flatten entity), ví dụ DHNDetail ~270–314:

- Expression: `'[tien_nt2]:=[so_luong]*[gia_nt]'`, ternary `phi_dvtn_yn`, × `$ty_gia`, …
- Aggregate: `['t_ck_nt', 'ck_nt']`, filter entity `VoucherGoodsTypeFomulaGrid`, …
- Master formulas: `t_tt_nt`, `t_thue_nt_net`, …

## Không quan tâm / không bắt buộc nữa

| Hạng mục | Ghi chú |
|----------|---------|
| Parse `onChange$…` / `switch (name)` | **Không** là nguồn sự thật cho UI chính |
| `validExpression` / `executeExpression` / thứ tự case | Không cần khớp runtime FBO |
| Resolve `var agg = getAggregate$…` / `row_phi` | **Hủy** yêu cầu FIX còn sót kiểu “expand helper trong case” |
| `extra_js` / `calcGiaDvtn` | Không cần hiện trên UI chính |

`ScenarioParser` có thể **giữ code** (không bắt xóa) nhưng **không** điều khiển playground / caption / canvas mặc định. Tab “Kịch bản” nếu còn → ẩn, gỡ, hoặc đổi thành “Nhóm công thức” theo `group` (qty_price / amount / …).

---

## UI phải làm gì (thay scenario onChange)

### 1. Từ điển + giải thích tiếng Việt (cốt lõi)

Mỗi entry `g.$a`:

- Alias, kind (`formula` / `aggregate` / `aggregate_filter`)
- `plain_vi` (đã có)
- Target / master / refs

### 2. Luồng phụ thuộc từ chính `g.$a` (không từ onChange)

Vẽ React Flow theo **entries**:

- Node = field (`so_luong`, `tien_nt2`, `t_tt_nt`, …)
- Cạnh formula: mỗi `ref` → `target`
- Cạnh aggregate: `grid_col` → `master` (nét đứt)
- **Không** vẽ “mạng nhện mọi alias cùng lúc gây rối”: mặc định lọc theo **nhóm** (`group`) hoặc theo **field đang focus** (inbound + outbound 1–2 hop)

Gợi ý mặc định mở DHN: nhóm `amount` + `discount` + `tax` + `master` (hoặc “path tiền chuẩn” heuristic bên dưới).

### 3. Sân chơi 1 dòng — chạy theo dependency trong `g.$a`, không theo case

**Cấm** (không còn): chỉ chạy `scenario.formula_aliases` lấy từ onChange.

**Làm:**

1. Lấy các entry `kind === 'formula'` có AST.
2. Khi nhiều alias ghi **cùng** `target` (vd `tien2` vs `tien2_sl` vs `gia_tg`):  
   - **Path mặc định NT (chốt cho demo):** ưu tiên alias  
     `tien_nt2_sl` → `tien2` (không `tien2_sl`) → `ck_nt` → `ck_tl` → `thue_nt` → `thue_tl` → phí (`tien_mthang_*`, `s5`, `thue_dvtn_*`) → aggregates `t_*` → master `t_thue_*_net`, `t_tien_*`, `t_tt*`.  
   - Alias nhánh khác (`gia_nt_sl`, `tien2_sl`, `*_zero`, …) **không** chạy trong demo mặc định; hiện trong từ điển + có thể bật “Nhánh: sửa Giá hạch toán” sau (optional).
3. Thứ tự chạy: topological theo `refs` → `target` trong tập alias đã chọn; nếu cycle → bỏ alias gây cycle + warning mềm.
4. Aggregate: 1 dòng → `master = grid_col` (như hiện tại).
5. User sửa ô input (`so_luong`, `gia_nt`, `tl_ck`, `thue_suat`, `ty_gia`, `phi_dvtn_yn`, …) → recalc đúng tập alias mặc định.

Seed số DHN giữ nguyên (10 × 100000 → tiền/CK/thuế như checklist 08).

---

## Việc Gemini cần làm (checklist)

- [ ] Playground + canvas **không phụ thuộc** `model.scenarios` từ onChange để tính số / vẽ mặc định.
- [ ] Thêm builder phía host hoặc webview: `default_demo_chain: string[]` (danh sách alias) trong `FormulaModel` **hoặc** derive client-side từ `entries` theo rule path NT ở trên.
- [ ] Tab/UI “Kịch bản onChange”: gỡ hoặc đổi label thành nhóm/`g.$a` — không nói “Khi sửa …” từ `case`.
- [ ] FIX còn lại kiểu expand `agg`/`row_phi` trong ScenarioParser: **không làm** (out of scope).
- [ ] Giữ FIX-02 sanitize CDATA — vẫn cần để entity `&VoucherGoodsTypeFomulaGrid;` hiện đủ trong từ điển.
- [ ] Test: fixture / DHN → entries có `tien_nt2_sl`, `t_tt_nt`, `t_tien_giam_nt` (nếu entity có); playground seed ra đúng tiền/CK/thuế **không** cần scenario parse.
- [ ] `npm run build:formula-preview` + `npm run test:formula-preview`.

---

## Done (nghiệm thu theo ý user)

Mở `DHNDetail.xml` → Preview Công thức:

1. Thấy các công thức 270–314 (sau flat) dưới dạng tiếng Việt + graph phụ thuộc.
2. Gõ Số lượng / Giá nt → thấy Tiền, CK, Thuế, (và tổng nếu aggregate/master trong `g.$a`) đổi.
3. Tick Phí DV-TN → thấy nhánh `tien_mthang_*` / `s5` / `thue_dvtn_*` đổi theo formula trong `g.$a`.
4. **Không** cần đúng danh sách case `onChange` hay `validExpression`.

---

## Cập nhật tư duy so với docs cũ

Spec `formula-preview/01`–`05` từng nhấn mạnh scenario onChange. **FEAT-06 này thắng** khi mâu thuẫn: presentation của sổ `g.$a` là mục tiêu; onChange chỉ là optional kỹ thuật, không phải MVP UX.
