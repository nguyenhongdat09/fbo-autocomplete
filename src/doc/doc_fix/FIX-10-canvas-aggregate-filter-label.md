# FIX-10 — Canvas React Flow chưa hiện điều kiện `aggregate_filter`

## Mức: High (UX hình — user vừa gửi screenshot)

## Hiện tượng

Tab / danh sách text **đã đúng**:

```
t_thue_dvtn_nt → Cộng dồn Thuế nt … (khi tick Phí DV-TN)
t_thue_dvtn    → Cộng dồn Thuế … (khi tick Phí DV-TN)
```

Nhưng **hình luồng (React Flow)** chỉ hiện node Σ generic:

```
Σ Cộng dồn vào
```

Không có chữ / badge / cạnh nào nói **`[phi_dvtn_yn] != 0`** (hay bản Việt *khi tick Phí DV-TN*). User nhìn sơ đồ **không biết** vì sao `thue` đổ vào `t_thue_dvtn` thay vì `t_thue`.

Cùng một cặp nguồn `thue` → hai túi master (`t_thue` vs `t_thue_dvtn`) nhìn **y hệt nhau** trên canvas — mất ý nghĩa filter.

---

## Nguyên nhân (đã có sẵn data, UI bỏ quên)

`FormulaFlowCanvas.jsx` **đã** truyền vào node:

```js
data: {
  master: e.master,
  grid_col: e.grid_col,
  filter: e.filter,       // '[phi_dvtn_yn] != 0'
  plain_vi: e.plain_vi,   // đã Việt hóa
}
```

Nhưng `AggregateNode.jsx` **không render** `filter` / `plain_vi`:

```jsx
<strong>Σ {data.label || data.name}</strong>   {/* cả hai thường undefined */}
Cộng dồn vào {data.masterName || data.name}  {/* masterName không được set */}
```

→ Node trống nghĩa + không điều kiện. FIX-09 mục “Canvas optional” đã bị bỏ qua — **nâng thành bắt buộc**.

---

## Việc phải làm

### 1. `AggregateNode` — hiện điều kiện khi `aggregate_filter`

Node Σ phải đọc rõ trên hình (không cần mở tab Từ điển):

| Dòng | Nội dung |
|------|----------|
| Tiêu đề | `Σ Cộng dồn` (hoặc `Σ Có điều kiện` khi có filter) |
| Đích | `→ {master}` — dùng `data.master` (hiện đang không bind) |
| **Điều kiện** | Chỉ khi `data.filter` (hoặc `kind === 'aggregate_filter'`): dòng phụ / badge |

**Nhãn điều kiện (ưu tiên):**

1. `data.filter_vi` nếu builder/canvas truyền sẵn (ngắn).
2. Hoặc rút từ `plain_vi`: phần trong ngoặc `(khi …)` → hiện `khi tick Phí DV-TN`.
3. Fallback raw `data.filter` nếu thiếu Việt hóa.

**Không** chỉ để tooltip ẩn — user phải **đọc được trên node** (screenshot phải thấy).

Ví dụ render mong muốn:

```
Σ Cộng dồn (có ĐK)
→ t_thue_dvtn
khi tick Phí DV-TN
```

### 2. `FormulaFlowCanvas` — truyền đủ props

Khi tạo `agg-*` node:

```js
data: {
  kind: e.kind,                 // 'aggregate' | 'aggregate_filter'
  master: e.master,
  grid_col: e.grid_col,
  filter: e.filter || null,
  filter_vi: /* ngắn: 'khi tick Phí DV-TN' — parse từ plain_vi hoặc toPlainVi(filter_ast) */,
  plain_vi: e.plain_vi,
  active: /* optional: filter_ast eval theo values hiện tại */,
}
```

- Aggregate **không** filter: không hiện dòng điều kiện (giữ gọn).
- Aggregate **có** filter: luôn hiện dòng điều kiện.

### 3. Phân biệt hình học (khuyến nghị mạnh)

Để hai cạnh `thue → Σ → t_thue` vs `thue → Σ → t_thue_dvtn` không bị nhầm:

- Node `aggregate_filter`: border / nền khác nhẹ + badge `ĐK` hoặc `IF`.
- Optional: khi `values` làm filter **false**, node Σ + cạnh vào master **mờ** (`opacity ~0.35`) — tick Phí DV-TN thì Σ vào `t_thue_dvtn_*` sáng, Σ vào `t_thue_*` mờ (và ngược lại).

Không bắt buộc animation phức tạp.

### 4. Không đụng lại evaluator / plain_vi text

FIX-09 (eval + `plain_vi` tab) giữ nguyên. Fix này **chỉ** canvas / `AggregateNode` (+ props từ `FormulaFlowCanvas`).

---

## Smoke / Done

Mở Preview trên `DHNDetail` (hoặc fixture có `t_thue_dvtn`):

- [ ] Node Σ trước `t_thue_dvtn` / `t_thue_dvtn_nt` **có chữ** kiểu *khi tick Phí DV-TN* (không chỉ “Cộng dồn vào”)
- [ ] Node Σ trước `t_thue` / `t_thue_nt` **có chữ** kiểu *khi không tick Phí DV-TN*
- [ ] Tab text vẫn giữ `plain_vi` như hiện tại
- [ ] Screenshot: không còn Σ trống nghĩa giống hệt nhau giữa hai túi thuế

`npm run build:formula-preview`.

---

## Không làm

- Không đổi grammar / parser aggregate 3 phần tử
- Không bắt buộc node IF/diamond riêng (badge + dòng chữ trên Σ là đủ)
- Không yêu cầu hiện raw `[phi_dvtn_yn] != 0` nếu đã có bản Việt
