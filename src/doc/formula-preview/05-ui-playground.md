# 05 — UI Webview: Sân chơi công thức

## Nguyên tắc

1. **Non-tech first:** hero là sân chơi số, không phải code.
2. **Một lần nhìn:** 1 dòng hàng + dải tổng phiếu.
3. **Sinh động có chủ đích (2–3 motion):** pulse ô vừa tính; sáng cạnh trên luồng; số đổi mượt (opacity/transition), không confetti / glow tím.
4. **Theme VS Code:** `var(--vscode-foreground)`, `editor-background`, `button-background`, `focusBorder`. Light/dark theo payload host (`theme: 'dark'|'light'`) hoặc class `body.vscode-light/dark`.
5. **Khung giống Flat Preview:** toolbar trên, banner warning, workspace dưới — **không** copy code view XML. Canvas luồng = React Flow (không tự vẽ SVG thủ công).
6. **CSS bắt buộc:** import `@xyflow/react/dist/style.css` trong entry React (webpack `css-loader`).

---

## Layout tổng

```
┌ Toolbar: [Refresh] [Đặt lại demo] [☑ Hiện cột ẩn] [Ngôn ngữ nhãn V|E]     tìm alias…
├ Warnings (collapsible)
├ ┌─ HERO: Một dòng hàng ─────────────────────────────────────────────┐
│ │  [Kịch bản: Khi sửa Số lượng ▾]     Tỷ giá phiếu [  1  ]          │
│ │  ┌ Nguyên tệ ──────────────┐  ┌ Hạch toán ──────────────┐        │
│ │  │ Số lượng     [in]       │  │ Giá           [in/out]  │        │
│ │  │ Giá nt       [in]       │  │ Tiền          [out]     │        │
│ │  │ Tiền hàng nt [out]      │  │ Chiết khấu    [out]     │        │
│ │  │ CK nt / Thuế nt …       │  │ Thuế          [out]     │        │
│ │  │ ☐ Phí DV-TN             │  │                         │        │
│ │  └─────────────────────────┘  └─────────────────────────┘        │
│ │  Caption dưới ô focus: «Tiền hàng nt = Số lượng × Giá nt»         │
│ │  ┌ Tổng trên phiếu: Tiền hàng | CK | Thuế | Thanh toán (nt + ht) ┐ │
│ └──────────────────────────────────────────────────────────────────┘
├ Luồng nghiệp vụ (swimlane ngang, click node → chọn ô playground)
└ Tabs: [Kịch bản] [Từ điển g.$a] [Công thức thô]
```

---

## Toolbar

| Control | Hành vi |
|---------|---------|
| Refresh | `postMessage { type: 'refresh' }` |
| Đặt lại demo | gán lại `playground.values` seed + scenario mặc định + recalc |
| Hiện cột ẩn | toggle hiện field `hidden` trên hero |
| Nhãn V / E | `header_v` vs `header_e` (fallback name) |
| Tìm | filter từ điển + highlight node luồng theo alias/field |

Phím: `R` refresh (khi webview focus), giống Flat Preview.

---

## Hero — Sân chơi

### Ô nhập vs ô tính

- **Input:** field xuất hiện như `trigger` của scenario nào đó, hoặc seed nhập (`so_luong`, `gia_nt`, `gia`, `tl_ck`, `thue_suat`, `ty_gia`, `phi_dvtn_yn`, `ty_le`, `tienmt_nt`…).
- **Output:** target của formula trong scenario active — `readOnly`, nền hơi khác, không pointer edit (trừ khi user chọn scenario “sửa Tiền hàng nt” thì `tien_nt2` thành input).

Khi user đổi input:

1. Set `active_scenario` = scenario có `trigger_field === name` (nếu có).
2. Recalc evaluator.
3. Pulse CSS class `.just-updated` ~600ms trên `last_written`.
4. Cập nhật caption = `plain_vi` của alias **vừa** ghi ô đang highlight (hoặc alias đầu tiên trong chain).

### Hai cột NT / HT

- Cột trái: field tên chứa `_nt` hoặc group amount/discount/tax bản nt.
- Cột phải: bản không `_nt`.
- `ty_gia` và checkbox phí: hàng riêng full width dưới hoặc trên.

Không dùng card bóng đổ; dùng border 1px `var(--vscode-panel-border)`.

### Tổng phiếu

Hàng sticky dưới hero: các `t_*` có trong values sau aggregate/master. Nhãn từ FieldInfo master. Điểm nhấn: `t_tt` / `t_tt_nt` font đậm hơn một bậc.

### Caption / storytelling

Một dòng dưới lưới ô:

> Bước 2/6 · Tiền hàng nt = Số lượng × Giá nt

Không markdown phức tạp. Có thể nút «Xem chuỗi» scroll tới tab Kịch bản.

---

## Luồng nghiệp vụ (React Flow Canvas)

Sử dụng **React Flow (`@xyflow/react`)** kết hợp **`dagre`** auto-layout (hướng `LR` - Left to Right).

### 1. Custom Node Types

- **`FieldNode` (`type: 'fieldNode'`):**
  - Hiển thị: Nhãn (`header_v`), tên field kỹ thuật (`name`), giá trị hiện tại (`value`).
  - Phân loại trực quan:
    - *Input node:* Viền xanh, có badge `Nhập` (ví dụ `so_luong`, `gia_nt`, `ty_gia`).
    - *Computed node:* Viền trung tính, có icon `fx` hoặc badge `Tính` (ví dụ `tien_nt2`, `ck_nt`).
  - Animation: Khi `just_updated === true`, node kích hoạt hiệu ứng pulse viền sáng ~600ms.
  - Handles: Target handle ở bên trái (`Position.Left`), Source handle ở bên phải (`Position.Right`).
- **`AggregateNode` (`type: 'aggregateNode'`):**
  - Node trung gian tổng dồn (ví dụ `Σ t_ck_nt`).
  - Hiển thị: Icon `Σ` + nhãn cột đích trên master phiếu.

### 2. Edges (Dây nối)

- **Source & Target:** Nối từ `refs[]` (source) → `target` (target) của từng công thức trong scenario đang active.
- **Phân loại dây:**
  - *Dây công thức:* Nét liền (Solid curve - Bezier/SmoothStep), màu theo theme (`var(--vscode-editor-foreground)` mờ).
  - *Dây aggregate:* Nét đứt (`strokeDasharray: '5,5'`).
  - *Active / Step run:* Khi recalc, các dây thuộc bước tính vừa chạy được gắn cờ `animated: true` và đổi màu sáng (`var(--vscode-focusBorder)`).

### 3. Auto-Layout (Dagre)

- Graph được tính toán tự động qua hàm `getLayoutedElements(nodes, edges, direction = 'LR')`.
- Node spacing: `nodesep = 30`, `ranksep = 60`.
- Mỗi khi đổi Scenario → lọc lại nodes/edges của scenario đó → chạy Dagre → `fitView()` cho vừa khung.
- **Chỉ vẽ chain scenario active** (không mạng nhện toàn `g.$a`) — khớp non-goal README.

### 4. Tương tác Canvas ↔ Sân chơi

- **Click Node trên Canvas:** Highlight ô input/output tương ứng trên Sân chơi Hero và focus con trỏ vào đó.
- **Focus ô trên Sân chơi:** Highlight node tương ứng trên Canvas (gắn class `.node-selected`) và pan nhẹ tới node đó nếu nằm ngoài viewport.
- **Controls:** Đi kèm `<Background variant="dots" />`, `<Controls />`, và `<MiniMap />` thu nhỏ ở góc dưới.

---

## Tab Kịch bản

List `scenarios`:

```
● Khi sửa Số lượng
  1. tien_nt2_sl — Tiền hàng nt = Số lượng × Giá nt
  2. tien2 — Tiền = Tiền hàng nt × Tỷ giá
  …
  Σ t_ck_nt — Cộng dồn …
  ★ t_tt_nt — Tổng thanh toán nt = …
  ⚠ Có thêm JS: calcGiaDvtn$... (không mô phỏng trong sân chơi)
```

Click scenario → active + recalc từ values hiện tại (không reset số trừ khi user bấm Đặt lại).

---

## Tab Từ điển

Bảng:

| Alias | Loại | Ghi vào | Giải thích | Raw |
|-------|------|---------|------------|-----|
| `tien_nt2_sl` | Công thức | `tien_nt2` | … | `[tien_nt2]:=...` |

Filter theo ô tìm toolbar. Click dòng → highlight trên luồng nếu target đang hiện.

---

## Tab Công thức thô

`<pre>` khối `g.$a` đã flatten (từ extractor) — dành debug. Nút Copy. Không highlight entity (không phải Flat Preview).

---

## Empty / error states

| State | UI |
|-------|-----|
| `NO_GA_BLOCK` | Illustration ngắn + “File Grid này chưa khai báo g.$a trong script.” |
| Parse ok nhưng 0 formula | Banner + từ điển unknown |
| Evaluator lỗi 1 alias | Bỏ alias, toast nhỏ trong banner, các bước khác vẫn chạy |

---

## Message protocol (webview ↔ host)

### Webview → Host

| type | payload |
|------|---------|
| `ready` | — |
| `refresh` | — |
| `copy` | `{ text }` |
| `log` / `error` | `{ message }` |
| `revealAlias` | `{ alias }` optional — host tìm `g.$a.alias` trong editor và reveal (nice-to-have MVP+) |

### Host → Webview

| type | payload |
|------|---------|
| `formulaModel` | `FormulaModel` |
| `error` | `{ message, stack? }` |

Lần đầu: host inject `window.__FORMULA_PREVIEW__ = model` **hoặc** đợi `ready` rồi `postMessage` (chốt: **ready handshake** như PreviewForm — tránh race).

---

## CSS / a11y tối thiểu

- Focus ring `focusBorder` trên input.
- Checkbox + label bấm được vùng rộng.
- Không chỉ dựa vào màu: ô output có icon khóa nhỏ hoặc chữ “tính”.
- `prefers-reduced-motion`: tắt pulse / transition dài.

---

## Không làm trên UI

- Không dashboard nhiều widget / stat strip.
- Không emoji trang trí.
- Không auto-play animation vô hạn.
- Không edit XML.
- Không chat AI trong panel.
