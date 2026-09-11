# FIX-12 — Click node → focus path (làm tối node/cạnh không liên quan)

## Mức: Medium (UX — user hỏi, thư viện hỗ trợ)

## Trả lời nhanh

**Làm được.** `@xyflow/react` (React Flow) **không** cần API “focus mode” riêng: chỉ cần khi `onNodeClick` tính tập node/edge liên quan rồi set `style.opacity` / `className` trên node + edge. Canvas hiện đã có `onNodeClick` + `selected` theo `focusedField` — **chưa** làm tối phần còn lại.

---

## Hành vi mong muốn

1. User click node `thue_suat` (hoặc bất kỳ field / Σ).
2. **Sáng** (opacity 1, cạnh nổi): chính node đó + mọi node/cạnh **liên quan**.
3. **Mờ** (opacity ~0.2–0.3): node/cạnh còn lại trên canvas đang hiện.
4. Click nền trống (pane) hoặc nút **Bỏ focus** → trở lại bình thường (không mờ).
5. Vẫn giữ chip nhóm / fullscreen như cũ; focus path **chồng** lên filter nhóm (chỉ áp trên node đang render).

### Định nghĩa “liên quan”

Theo **đồ thị cạnh đang vẽ** (`edges` hiện tại), hai chiều:

- **Downstream:** đi theo `source → target` từ node click (vd `thue_suat` → `thue_nt` → Σ → `t_thue_nt` / `t_thue_dvtn_nt`…).
- **Upstream:** đi ngược cạnh vào node click (vd nguồn của `thue_nt` cũng sáng nếu click `thue_nt`).

Thuật toán: BFS/DFS trên adjacency từ `edges` (**directed** `source → target` — chỉ descendants). **Không** BFS undirected (sẽ nối cả đồ thị qua field chung → không thấy mờ). Chi tiết sửa: **[FIX-13](./FIX-13-focus-path-directed-bfs.md)**.

**Không** cần parse lại `g.$a` — chỉ dùng graph canvas.

---

## Việc phải làm

### 1. State

```js
const [focusNodeId, setFocusNodeId] = useState(null); // null = không focus
```

- `onNodeClick`: `setFocusNodeId(node.id)` (+ giữ `onNodeSelect` playground nếu đang có).
- `onPaneClick`: `setFocusNodeId(null)`.
- Optional: nút nhỏ cạnh chip “Bỏ focus” khi `focusNodeId != null`.

### 2. Helper

```js
function collectRelatedNodeIds(startId, edges) {
  // BFS hai chiều trên edges; return Set<nodeId>
}
```

Edge liên quan = cạnh có **cả** `source` và `target` ∈ related set.

### 3. Áp style sau layout / khi đổi focus

Khi `setNodes` / `setEdges` (hoặc `useEffect` theo `focusNodeId`):

- Node trong related (hoặc `focusNodeId == null`): `opacity: 1`, có thể `zIndex` cao hơn cho node focus.
- Node ngoài: `opacity: 0.25` (và `pointerEvents` giữ click được để đổi focus).
- Edge: tương tự; cạnh related có thể `strokeWidth` +1 hoặc `animated: true` nhẹ.

Truyền `data.dimmed` vào custom node nếu cần CSS class (FieldNode / AggregateNode), hoặc style ở cấp React Flow node là đủ.

### 4. Tương thích filter ĐK (FIX-10)

Node Σ đang dùng `opacity` theo filter Đúng/Sai: khi **có focus path**, ưu tiên:

- Ngoài related → luôn mờ mạnh (focus thắng).
- Trong related + filter SAI → có thể mờ vừa (0.4) vẫn đọc được điều kiện.

---

## Done

- [ ] Click `thue_suat`: sáng path thuế; node/cạnh không trên path mờ rõ trên screenshot.
- [ ] Click pane: hết mờ.
- [ ] Click node khác: đổi path focus.
- [ ] Không phá chip nhóm / aggregate filter label.
- [ ] `npm run build:formula-preview`.

---

## Không làm

- Không phụ thuộc plugin trả phí / API experimental.
- Không ẩn hẳn node ngoài path (chỉ làm tối — vẫn thấy ngữ cảnh).
- Không viết lại dagre layout mỗi lần click focus.
