# FIX-13 — Focus path không thấy mờ: BFS hai chiều làm sáng cả đồ thị

## Mức: High (user báo: chỉ hiện nút «Bỏ focus», nhìn như chưa làm)

## Hiện tượng

Click `thue_suat` (hoặc node bất kỳ):

- Nút **✕ Bỏ focus** hiện → `focusNodeId` **đã** set đúng.
- Node/cạnh **không** đổi sáng/tối — nhìn y như trước khi có FIX-12.

---

## Root cause (đã đọc code)

### 1. Bug chính — `collectRelatedNodeIds` BFS **undirected**

`FormulaFlowCanvas.jsx`:

```js
adj.get(edge.source).push(edge.target);
adj.get(edge.target).push(edge.source); // ← hai chiều
// rồi BFS…
```

Trên đồ thị công thức FBO, mọi nhánh nối qua field chung (`tien_nt2`, `ck_nt`, `thue_nt`…).

Ví dụ click `thue_suat`:

1. `thue_suat` → `thue_nt`
2. Từ `thue_nt` **đi ngược** cạnh tới `tien_nt2`, `ck_nt`, …
3. Từ đó lan ra **toàn bộ** Tiền / CK / Phí / Master

→ `relatedNodeIds` ≈ **hầu hết / toàn bộ** node đang vẽ  
→ mọi node `opacity: 1`  
→ user **không thấy** làm tối gì cả (chỉ thấy nút Bỏ focus).

FIX-12 ghi “hai chiều / undirected” là **sai cho DAG công thức**. Phải sửa thuật toán.

### 2. Bug phụ — AggregateNode ghi đè `opacity` nội bộ

`AggregateNode.jsx` luôn:

```js
style={{ opacity: isActive ? 1 : 0.45, ... }}
```

Ngay cả khi wrapper `.react-flow__node` có `opacity: 0.25`, mắt vẫn dễ “đều đều” nếu hầu hết Σ vẫn related (do bug 1). Sau khi sửa BFS, **bắt buộc** tôn trọng `data.dimmed` (khi dimmed → opacity thấp hơn, không ép `1`).

### 3. Bug phụ — rebuild graph thiếu `focusNodeId` trong deps

Effect dựng dagre:

```js
}, [model, values, lastWritten, focusedField, selectedGroup, fitView]);
// thiếu focusNodeId
```

Click field còn gọi `onNodeSelect` → đổi `focusedField` → rebuild lại. Effect focus riêng (`[focusNodeId]`) dùng `edges` closure có thể **stale**. Nên:

- Thêm `focusNodeId` vào deps rebuild **hoặc**
- Chỉ áp focus bằng một helper gọi từ cả hai nơi, và trong effect focus dùng `prevEdges` cho **cả** nodes lẫn edges (đừng đọc `edges` ngoài `setNodes`).

---

## Algorithm đúng (thay undirected)

**Path liên quan = node click + mọi descendant theo cạnh có hướng `source → target`.**

```js
function collectRelatedNodeIds(startId, edges) {
  // adj: source -> [targets]  (CHỈ một chiều)
  // BFS/DFS từ startId theo adj
  // return Set gồm startId + descendants
}
```

| Click | Sáng (ví dụ) | Mờ |
|-------|----------------|-----|
| `thue_suat` | `thue_suat` → `thue_nt` → `thue` / Σ → `t_thue_*` / `t_thue_dvtn_*`… | `so_luong`, `gia_*`, `tien_*`, `ck_*`, phí… |
| `thue_nt` | `thue_nt` + downstream (không kéo ngược `thue_suat` trừ khi optional) | phần còn lại |
| Σ `agg-t_thue_nt` | Σ đó + master `t_thue_nt` (+ master formulas từ master nếu có cạnh) | phần còn lại |

**Optional (không bắt buộc MVP):** nếu click node **tính** (computed), thêm **1 hop upstream** (cha trực tiếp) để thấy input — **không** BFS ngược sâu.

Edge related = cả `source` và `target` ∈ related set.

---

## Việc phải làm

1. Sửa `collectRelatedNodeIds` → BFS **directed** downstream only (bỏ `push` ngược target→source).
2. Truyền `data.dimmed = !isRelated` (khi đang focus) vào mọi node; `FieldNode` / `AggregateNode` thêm class `dimmed` + CSS:

   ```css
   .field-flow-node.dimmed,
   .aggregate-flow-node.dimmed { opacity: 0.28; }
   ```

   Aggregate: khi `data.dimmed` → không set opacity 1 theo `isActive`.
3. Edge ngoài path: `opacity: 0.12`, stroke nhạt; edge trong path: giữ màu + có thể `strokeWidth` +0.5.
4. Đồng bộ focus:
   - Effect focus: trong `setNodes`/`setEdges` chỉ dùng functional updater + `prevEdges` cho BFS.
   - Thêm `focusNodeId` vào deps effect rebuild **hoặc** sau `setNodes(layout)` luôn `applyFocusStyles(..., focusNodeId)`.
5. Smoke tay: click `thue_suat` trên nhóm Thuế / Tất cả — **thấy rõ** nửa canvas mờ; path thuế sáng; nút Bỏ focus / click pane về bình thường.

`npm run build:formula-preview` sau sửa.

---

## Done

- [ ] Click `thue_suat`: path thuế sáng; tiền/CK/phí **mờ rõ** (không còn “chỉ hiện nút”).
- [ ] Click `so_luong`: sáng nhánh số lượng→tiền→…; thuế suất không bắt buộc sáng.
- [ ] Bỏ focus → mọi node về opacity bình thường (Σ vẫn tôn trọng ĐK Đúng/Sai của FIX-10).
- [ ] Không dùng lại BFS undirected.

---

## Không làm

- Không đổi layout dagre mỗi lần click.
- Không ẩn node (display:none) — chỉ làm mờ.
- Không phụ thuộc plugin React Flow trả phí.
