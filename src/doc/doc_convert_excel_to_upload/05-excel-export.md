# 05 — Excel Export

## 1. Template

| | |
|--|--|
| Path runtime | `path.join(resolveBundledDatabaseRoot(), 'upload_chuan.xlsx')` |
| Helper | [`extensionDatabasePaths.resolveBundledDatabaseRoot`](../../extensionDatabasePaths.js) |
| Dev path | `src/Database/upload_chuan.xlsx` (đã có trong repo) |
| Sheet | `workbook.worksheets[0]` (`Sheet1`) |
| Header row | **5** |
| Legend row | **3** |
| Data row | 6+ — **không ghi** trong MVP |

Khác `ConvertToExcel`: template `mau_chuan.xlsx`, header dòng **9**.

### Pack VSIX (bắt buộc)

Thêm vào [`.vscodeignore`](../../../.vscodeignore) cạnh dòng `mau_chuan.xlsx`:

```
!src/Database/upload_chuan.xlsx
```

Nếu thiếu whitelist, file bị ignore khi pack → runtime “Không tìm thấy upload_chuan.xlsx”.

---

## 2. API exporter

**File:** `src/ConvertExcelFromUpload/excel/UploadExcelExporter.js`

```js
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { resolveBundledDatabaseRoot } = require('../../extensionDatabasePaths');

/**
 * @param {Array<{ name: string, column: string, header: string, required: boolean }>} cells
 * @param {string} outputPath
 * @returns {Promise<void>}
 */
async function exportUploadExcel(cells, outputPath) { }
```

### Bước thực hiện

1. Resolve `templatePath`; nếu `!existsSync` → throw / showError.
2. `workbook.xlsx.readFile(templatePath)`.
3. Clear / overwrite các ô header cũ trên dòng 5 trong vùng sẽ ghi (template mẫu có sẵn vài cột — **ghi đè** theo `cells`; cột không có trong `cells` có thể để nguyên hoặc clear hàng 5 toàn bộ trước khi ghi — **chốt: clear toàn bộ row 5 dùng tới cột max rồi ghi lại** để tránh header mẫu lẫn field mới).
4. Ghi legend dòng 3.
5. Với mỗi `cell` trong `cells`: ghi `worksheet.getCell(`${column}5`)`.
6. `workbook.xlsx.writeFile(outputPath)`.

---

## 3. Legend dòng 3

Text cố định:

```text
* Tên trường bắt buộc nhập
```

Gợi ý đặt tại ô `D3` hoặc `A3` (mẫu ảnh: vùng giữa-phải gần cột D–E). **Chốt:** ghi vào **`D3`**.

Style:

- Font italic
- Màu đỏ cho cả chuỗi (hoặc `*` đỏ + phần còn lại đỏ italic — khớp ảnh: toàn bộ đỏ italic)

ExcelJS:

```js
const legend = worksheet.getCell('D3');
legend.value = {
  richText: [
    { text: '* Tên trường bắt buộc nhập', font: { italic: true, color: { argb: 'FFFF0000' }, name: 'Arial', size: 11 } },
  ],
};
```

---

## 4. Header cell (dòng 5)

### Không bắt buộc (`required === false`)

```js
cell.value = headerText;
cell.alignment = { horizontal: 'center', vertical: 'middle' };
cell.font = { name: 'Arial', size: 11 };
```

### Bắt buộc (`required === true`)

Rich text: `*` đỏ + header đen (hoặc mặc định):

```js
cell.value = {
  richText: [
    { text: '*', font: { color: { argb: 'FFFF0000' }, name: 'Arial', size: 11 } },
    { text: headerText, font: { color: { argb: 'FF000000' }, name: 'Arial', size: 11 } },
  ],
};
cell.alignment = { horizontal: 'center', vertical: 'middle' };
```

> Ảnh mẫu: `*Mã vật tư` — không có space giữa `*` và tên. **Chốt: không thêm space.**

### Cột

Dùng đúng `cell.column` từ Upload (`"A"`, `"B"`, `"AA"`…). **Không** tính `getExcelColumnName(i)` tuần tự như ConvertGridToHeader.

### Clear row 5

Trước khi ghi, với mỗi cột từ `A` đến cột max (hỗ trợ A..ZZ từ `cells` và template mẫu):

```js
// Chuyển letter sang số 1..N và ngược lại để quét từ cột 1 đến maxColNumber
function columnLetterToNumber(letter) { ... }
function columnNumberToLetter(num) { ... }

for (let c = 1; c <= max_col; c++) {
  const col_letter = columnNumberToLetter(c);
  worksheet.getCell(`${col_letter}5`).value = null;
}
```

Cách này đảm bảo toàn bộ dòng 5 sạch sẽ, không bị sót lại các ô rác của template mẫu.

---

## 5. SaveDialog + mở file

Mirror [`extension.js` ConvertToExcel](../../extension.js) + [`ConvertGridToHeader.exportToExcel`](../../ConvertToExcel/ConvertGridToHeader.js):

```js
const baseName = path.basename(uploadPath, path.extname(uploadPath));
const defaultUri = vscode.Uri.file(
  path.join(path.dirname(uploadPath), `${baseName}_upload.xlsx`)
);

const fileUri = await vscode.window.showSaveDialog({
  defaultUri,
  filters: { Excel: ['xlsx'] },
  saveLabel: 'Xuất Excel Upload',
});
if (!fileUri) {
  vscode.window.showWarningMessage('Hủy xuất file Excel.');
  return;
}

await exportUploadExcel(cells, fileUri.fsPath);
vscode.window.showInformationMessage(`Đã xuất file: ${fileUri.fsPath}`);

const opened = await vscode.env.openExternal(fileUri);
if (!opened && process.platform === 'win32') {
  require('child_process').exec(`start "" "${fileUri.fsPath}"`);
}
```

Optional: copy path gợi ý `Templates\Excel` vào clipboard (ConvertToExcel làm vậy) — **không bắt buộc** MVP.

---

## 6. Không làm

- Không ghi formula / value dòng 6.
- Không merge title row 6–7 như `mau_chuan`.
- Không đổi Sheet2/Sheet3.
- Không phụ thuộc `PivotExcel.exe`.
