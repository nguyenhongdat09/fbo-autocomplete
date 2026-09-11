# 04 — Search & UI

## 1. Mục tiêu bước này

Sau khi parse Upload fields + derive prefix, lấy danh sách file **Dir/Grid** để user **chọn nhiều**, rồi đọc/flatten các file đó để build header catalog.

---

## 2. Lấy `groupRoot`

```js
const AppDataPathHelper = require('../TreeFile/AppDataPathHelper');

const helper = new AppDataPathHelper(uploadFsPath);
const groupRoot = helper.getProjectPath();
```

- `getProjectPath()` đã apply `ProjectMappingHelper.getActualRoot`.
- Không tự walk lên ổ đĩa tìm `App_Data`.

Nếu `groupRoot` rỗng / không tồn tại → toast lỗi, dừng.

---

## 3. Tái dùng `GroupFileIndexService` (bắt buộc)

SearchFile **không** phải SQL DB app — là **index file** (LevelDB + memory) dưới `src/TreeFile/SearchFile/`.

### Inject từ Tree (ưu tiên)

`TreeFileProvider` đã tạo service trong `run(context)` và expose qua bridge:

```js
this._groupIndexBridge = new GroupTreeIndexBridge({
  getIndexService: () => this._groupFileIndexService,
  ...
});
```

**Cách chốt cho Gemini:**

`registerConvertExcelFromUpload(context, deps)` nhận:

```js
deps = {
  getIndexService: () => GroupFileIndexService | null
}
```

Trong `extension.js`, sau khi `treeFileProvider.run(context)` (hoặc tương đương), truyền:

```js
registerConvertExcelFromUpload(context, {
  getIndexService: () => treeFileProvider._groupFileIndexService
    // hoặc public getter nếu agent thêm getGroupFileIndexService()
});
```

> Nếu thêm getter public `getGroupFileIndexService()` trên TreeFileProvider / OneLevel / Dynamic — **tốt hơn** access `_` private. Agent nên thêm thin getter trên cả 3 provider class đang dùng (mirror nhau) hoặc chỉ trên base đang active.

### Fallback nếu service null

Nếu `getIndexService()` trả `null` (tree chưa init):

- Toast: `Index SearchFile chưa sẵn sàng. Mở FBO Tree hoặc đợi index xong rồi thử lại.`
- **Không** tạo LevelDB instance mới song song (tránh lock/dup storage) trừ khi tuyệt đối bắt buộc — ưu tiên fail rõ.

### Gọi search

```js
const keyword = derive.keyword; // "AR*.xml" hoặc "zcamdm.xml"
const result = await indexService.search(groupRoot, keyword);
// result.filesRel: string[]
```

Matcher hỗ trợ `*` / `%` — xem `GroupFileQueryMatcher`.

**Không** gọi `publishSearchResult` (không làm bẩn panel Search Result) trừ khi muốn debug — MVP: không publish.

---

## 4. Pipeline filter kết quả

```
filesRel
  → filterDirGridPaths(filesRel)
  → if mode === 'exact': filterExactBaseName(..., prefix)
  → map to QuickPick items
```

### Absolute path để đọc file

```js
const abs = path.join(groupRoot, fileRel);
```

UNC (`\\172.168...`) phải hoạt động — `path.join` + SearchFile đã hỗ trợ UNC force-scan.

---

## 5. QuickPick multi-select

```js
const items = filtered.map((rel) => {
  const norm = rel.replace(/\\/g, '/');
  // label ngắn: "Dir/ARTran.xml" hoặc "Grid/ARDetail.xml"
  const parts = norm.split('/');
  const i = parts.map((p) => p.toLowerCase()).lastIndexOf('controllers');
  const short = i >= 0 ? parts.slice(i + 1).join('/') : path.basename(rel);
  return {
    label: short,
    description: rel,
    rel,
    abs: path.join(groupRoot, rel),
  };
});

const picked = await vscode.window.showQuickPick(items, {
  canPickMany: true,
  placeHolder: 'Chọn file Dir/Grid để lấy header field',
  matchOnDescription: true,
  title: 'Convert Excel From Upload',
});

if (!picked || picked.length === 0) {
  vscode.window.showWarningMessage('Chưa chọn file Dir/Grid.');
  return;
}
```

Thứ tự `picked` = thứ tự user chọn (VS Code giữ selection order) → dùng làm **first-wins** khi build catalog.

### Pre-select (optional, không bắt buộc MVP)

Có thể pre-check item có basename gần với Upload (vd Upload `ARTran` → check `Dir/ARTran.xml`, `Grid/ARDetail.xml` nếu có trong list) bằng `picked` default — **optional**. Không có thì user tự tick.

---

## 6. Flatten + catalog sau khi chọn

Với mỗi `picked` theo thứ tự:

```js
const entityResolver = require('../ReadXMLByJS/entityResolver');
const { expandXmlEntities } = require('../ReadXMLByJS/XmlFlatPreview/XmlEntityExpander');

const sourceText = entityResolver.readFileContent(item.abs);
const model = expandXmlEntities(item.abs, sourceText);
sources.push({ fileLabel: item.label, flatText: model.flat_text });
```

Rồi:

```js
const { catalog, warnings } = buildHeaderCatalog(sources);
const cells = mergeUploadWithHeaders(uploadFields, catalog);
```

Nếu mọi field Upload đều fallback ra `name` (catalog trống) → vẫn cho xuất, nhưng `showWarningMessage` cảnh báo thiếu header.

---

## 7. Thông báo UX

| Tình huống | UX |
|------------|-----|
| 0 kết quả sau filter | `showErrorMessage` — dừng trước QuickPick |
| User Esc QuickPick | warning / silent return |
| Flatten lỗi 1 file | skip file đó + warning; nếu hết file fail → error |
| Thành công search | không toast thừa trước QuickPick |

---

## 8. Không dùng

- Không mở `fbo_search_result_view` làm UI chọn (QuickPick đủ).
- Không dùng tree `canSelectMany` của `fbo_file` (user đang đứng trên Upload editor, không phải selection tree).
- Không query `query_radar` / CodeGraph.
