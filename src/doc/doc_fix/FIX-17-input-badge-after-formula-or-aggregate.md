# FIX-17 — Badge NHẬP sai trên field đã có formula / Σ (master `t_*`)

## Mức: Medium (user screenshot BIPODetail — `t_thue_nt`, `t_tien_nt`… badge xanh NHẬP)

## Hiện tượng

Trên sơ đồ Preview `BIPODetail.xml`:

- Có node Σ Cộng dồn → `t_thue_nt` / `t_tien_nt` / `t_tien` / …
- Field master **sau** Σ (và input của `t_tt_nt` / `t_tt`) vẫn badge **NHẬP** (xanh) thay vì **TÍNH** (xanh dương) hoặc ít nhất không phải “nhập tay”.

User hiểu nhầm: tưởng các tổng master là ô nhập, trong khi chúng được cộng dồn / công thức master ghi.

---

## Root cause (đã xác nhận)

[`FormulaFlowCanvas.jsx`](../../FormulaPreview/media/src/components/FormulaFlowCanvas.jsx) `ensureFieldNode`:

```js
const ensureFieldNode = (fieldName, isInput = false) => {
  if (!rawNodesMap.has(fieldName)) {
    rawNodesMap.set(fieldName, {
      // ...
      data: { /* ... */ isInput },
    });
  } else {
    const node = rawNodesMap.get(fieldName);
    node.data.value = values[fieldName];
    // ...
    // KHÔNG cập nhật isInput
  }
};
```

Thứ tự hiện tại:

1. Duyệt **formula** trước — `t_tt_nt` refs `t_tien_nt`, `t_thue_nt`, `t_cp_nt` → `ensureFieldNode(ref, true)` → gắn **NHẬP**.
2. Duyệt **aggregate** sau — `ensureFieldNode(e.master, false)` nhưng node **đã tồn tại** → `isInput` kẹt `true`.

Cùng pattern nếu formula A tạo target với `isInput: false`, rồi formula B gọi `ensureFieldNode(same, true)` — lần 2 không đổi (ít gặp hơn vì thứ tự `false` trước).

---

## Rule (bắt buộc)

### Phân loại badge

| Điều kiện | Badge |
|-----------|--------|
| Field chỉ xuất hiện trong `refs` / seed nhập, **không** là `target` formula và **không** là `master` aggregate | **NHẬP** (`isInput: true`) |
| Field là `target` của ≥ 1 formula **hoặc** `master` của ≥ 1 aggregate / aggregate_filter trong tập đang render | **TÍNH** (`isInput: false`) |

### Cách implement (chọn 1, ưu tiên rõ ràng)

**Cách A (khuyến nghị):** Precompute set trước khi tạo node:

```js
const computedFields = new Set();
entries.forEach(e => {
  if (!renderedAliasesSet.has(e.alias)) return;
  if (e.kind === 'formula' && e.target) computedFields.add(e.target);
  if ((e.kind === 'aggregate' || e.kind === 'aggregate_filter') && e.master) {
    computedFields.add(e.master);
  }
});
// ensureFieldNode(name): isInput = !computedFields.has(name)
```

**Cách B:** Khi `ensureFieldNode` lần 2: nếu gọi với `isInput === false` thì **ép** `node.data.isInput = false` (một chiều: computed thắng input).

Cách A tránh phụ thuộc thứ tự duyệt.

### Không đổi

- Aggregate node (`Σ`) giữ type riêng.
- Hero playground: ô nhập vẫn chỉ field tham gia `g.$a` chưa computed (FIX-08) — đồng bộ tinh thần: master `t_*` từ aggregate không nhét cột nhập nếu đã là computed.

---

## Việc phải làm (checklist code)

1. `FormulaFlowCanvas.jsx` — precompute `computedFields` (hoặc cập nhật `isInput` đúng rule).
2. Smoke BIPO **Tất cả**: `t_thue_nt`, `t_tien_nt`, `t_tt_nt`… **không** badge NHẬP; `so_luong`, `thue_suat`, `t_cp_nt` (nếu chỉ ref, không có formula/Σ ghi) vẫn có thể NHẬP.
3. `npm run build:formula-preview`.

---

## Done

- [ ] Sau Σ, master `t_*` badge TÍNH (hoặc không NHẬP)
- [ ] `t_tt` / `t_tt_nt` (formula target) badge TÍNH
- [ ] Input thật (`so_luong`, `thue_suat`, …) vẫn NHẬP
- [ ] `npm run build:formula-preview`

## Không làm

- Không đổi màu theme / copy nhãn badge (giữ NHẬP / TÍNH hiện có)
- Không đụng parser `g.$a`
