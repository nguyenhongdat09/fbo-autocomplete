# FIX-09 — Tab wrap + hiện name trong input + split canh trái/phải

> Bổ sung sau khi FIX-01…03 đã cải thiện tabs/layout. Đối chiếu:
> - **Hình 1 (Preview lỗi):** tab 1 hàng; input trống; “Ngày lập” + input **canh trái** cùng khối trái.
> - **Hình 2 (Form FBO thật):** tab **xuống dòng** khi tràn; panel phải (Ngày lập, Số CT, Trạng thái…) **dính phải** form.

Tuân thủ [`PRINCIPLE-design-fidelity.md`](./PRINCIPLE-design-fidelity.md): preview phải giúp Developer thấy đúng split/pattern.

---

## FIX-09a — Tabs tràn thì xuống dòng (như hình 2)

### Hiện trạng

`vscode-panels` / tab bar xếp **một hàng**; nhiều tab TNTran bị cắt hoặc chen chúc, **không wrap**.

### Đúng (FBO)

Tab bar **xuống dòng** (2–3 hàng): hết chỗ hàng 1 → nhảy hàng 2, v.v. Thứ tự vẫn theo declaration order (trái→phải, trên→dưới).

### Phải làm (UI)

1. Không phụ thuộc mặc định toolkit nếu nó không wrap.
2. CSS tab list (hoặc custom tab bar nếu toolkit cứng):

```css
.fbo-tab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  align-items: flex-end;
}
.fbo-tab-list vscode-panel-tab,
.fbo-tab-item {
  flex: 0 0 auto;
  white-space: nowrap;
}
```

3. Nếu `vscode-panels` **không** cho wrap: thay phần tab header bằng hàng nút/`div` tự render + vẫn dùng panel-view / hoặc tự `active_tab_ord` (đã có trong docs UI). **Ưu tiên** wrap đúng hơn là giữ toolkit một hàng.

4. Active tab: gạch chân / border rõ; click đổi nội dung như hiện tại.

### Done

- TNTran: thấy ≥ 2 hàng tab giống hình 2 (1.1… rồi hàng dưới 2.4… / 4.1…).
- Thu hẹp webview → tab xuống thêm hàng; không cắt mất tên tab.

---

## FIX-09b — Ô input / control hiện **name** field

### Mục đích

Preview không có data DB — Developer cần nhìn **ô nào map field nào**. Hiện input trống → khó đối chiếu XML.

### Quy tắc hiển thị

| Role / kind | Nội dung trong ô |
|-------------|------------------|
| `control` + input / date / dropdown (selected text) | Hiện **`field.name`** (vd `ma_kh`, `ngay_lct`, `status`) |
| `control` + checkbox | Có thể hiện name nhỏ cạnh box **hoặc** giữ label cột; ưu tiên đừng trùng `.Label` — gợi ý: `title`/`aria` = name, hoặc text phụ `ma_kh` |
| `lookup_name` (`%l`) | Hiện name dạng `ten_kh` / `ten_bp` (đúng field trong token `%l`, **không** ghép `_name`) |
| `description` | Vẫn strip HTML → text ngắn (`Xem...`); có thể thêm `(so_ct_goc)` nhỏ nếu cần — không bắt buộc |
| `label` | Vẫn `header_v` (nhãn người dùng), **không** thay bằng name |
| `grid` | Giữ `{name}_Grid` |
| `readOnly` control | Span readonly **vẫn hiện name** (vd `stt_rec`) để biết field — trừ khi cột width 0 / hidden |

### Implement gợi ý

```js
// vscode-text-field
html`<vscode-text-field value=${f.name} readonly></vscode-text-field>`
// hoặc placeholder=${f.name} nếu value bị toolkit xoá

// dropdown: option đầu hoặc text hiển thị = f.name; vẫn giữ options thật trong list
```

Không dùng lại bug cũ `ten_bp_name` / chữ `readonly`.

### Done

- General: ô cạnh “Mã khách” hiện `ma_kh`; lookup hiện `ten_kh` (hoặc tên field `%l`).
- “Ngày lập” input hiện `ngay_lct` (hoặc đúng name field trong XML).

---

## FIX-09c — `split`: panel 1 canh trái, panel 2 canh phải

### Quy ước FBO (đã có trong skill)

`view/@split` (TNTran: `split="7"`) cắt `master_columns` thành **2 cột cha**:

| Panel | Cột con |
|-------|---------|
| **1 (trái)** | `columns[0 .. split-1]` — canh **trái** form |
| **2 (phải)** | `columns[split .. end]` — canh **phải** form |

Ví dụ master 15 cột, `split="7"`:

- Trái: 7 cột đầu (`100, 110, 100, 90, 30, 147, 8`, …)
- Phải: 8 cột còn lại (chứa Ngày lập, Số CT, Trạng thái, …)

Pattern trên cùng một `<item>` có thể có slot ở **cả hai** panel (vd trái `dept_id`, phải `ngay_lct`).

### Bug hình 1

Toàn bộ row là **một** CSS grid full-width, các cột px xếp từ trái → “Ngày lập” nằm sát khối trái, **không** dạt phải như form FBO (hình 2).

### Phải làm

1. Parser/UI dùng `view.split` (và `category.split` nếu có trên tab):

```js
const split = view.split; // number, 1-based count of left columns — FBO split="7" = 7 cột đầu thuộc panel 1
const left_widths = column_widths.slice(0, split);
const right_widths = column_widths.slice(split);
```

> Xác nhận với XML: `split="7"` = **7** phần tử đầu (index 0..6). Khớp skill: “N phần tử đầu”.

2. Mỗi `ViewRow` / `FormRow` render:

```
[ row-container: display:flex; justify-content:space-between; width:100%; align-items:start ]
   [ panel-left:  grid theo left_widths;  justify-self/start ]
   [ panel-right: grid theo right_widths; margin-left:auto ]
```

3. Gán cell theo **pattern column index**:
   - `pattern_col < split` → panel trái
   - `pattern_col >= split` → panel phải  
   (vẫn tôn trọng FIX-02: width 0 ẩn; FIX-03: gap `-` trong từng panel)

4. Nếu **không** có `split` (null): một grid như hiện tại (full master) — không bắt buộc 2 panel.

5. Category có `split` riêng: áp dụng tương tự cho rows tab đó.

6. **Không** chỉ `text-align: right` trên label “Ngày lập” trong cùng grid trái — phải **tách panel** + canh phải khối panel 2.

### Minh họa

```
| Cửa hàng [dept_id] [ten_bp]     |                    [ngay_lct].Label [ngay_lct] |
| Loại SC  [loai_sc]              |                    [so_ct].Label   [so_ct]     |
| ... trái canh trái ...          |                    ... phải canh phải ...      |
```

### Done

- Preview TNTran: khối Ngày lập / Số chứng từ / Trạng thái **dính mép phải** webview (hoặc mép phải vùng form), giống hình 2.
- Thu hẹp/phóng panel: khoảng trống nằm **giữa** 2 panel, không đẩy panel 2 sát panel 1.

---

## File đụng

| File | Việc |
|------|------|
| `media/src/main.js` | Tab wrap / custom tab list; value=name; FormRow 2 panel theo split |
| `media/src/previewForm.css` | `.fbo-tab-list` wrap; `.form-row-split`, `.panel-left`, `.panel-right` |
| `parser/FormXmlParser.js` / model | Đảm bảo `view.split` / `category.split` có trong FormModel (đã parse thì UI dùng) |
| Tests (tuỳ chọn) | Unit: `split=7` + 15 cols → left 7 / right 8 |

## Checklist nghiệm thu

- [ ] Tab TNTran xuống ≥ 2 hàng khi hẹp (như hình 2).
- [ ] Input hiện `ma_kh`, `ngay_lct`, … không ô trống vô nghĩa.
- [ ] Panel phải (Ngày lập…) canh phải; panel trái canh trái; có khoảng giữa khi form rộng.
- [ ] Vẫn ẩn cột width `0`; không phá FIX-01…03.
