# Checking Error (WebView) — Implementation Plan cho Gemini

> **BẮT BUỘC ĐỌC TRƯỚC:** `docs/superpowers/specs/2026-07-26-checking-error-design.md`  
> **For agentic workers:** Implement **đúng từng Task**, đánh dấu `- [ ]` → `- [x]`. Không nhảy cóc. Không “cải tiến” ngoài plan.

**Goal:** Thêm **Checking Error** trên tree `fbo_file`: check lỗi entity/ref (đi sâu), chỉ khi có lỗi mới mở **WebView** để Generate copy file thiếu từ nhiều nguồn + đối chiếu entity thiếu khai báo.

**Architecture:** Toàn bộ code nằm trong `src/ReadXMLByJS/CheckingError/`. `extension.js` chỉ gọi `registerCheckingError(context, treeDataProvider)` (giống `registerXmlFlatPreview`). **CẤM** sửa logic `entityResolver.js`, `EntityHoverProvider.js`, `EntityDefinitionProvider.js`. Checking chỉ **require và gọi** API đã export.

**Tech Stack:** VS Code Extension API (WebviewPanel, commands, window), Node `fs`/`path`, CommonJS.

---

## Global Constraints (áp dụng mọi Task)

1. **Folder bắt buộc:** `src/ReadXMLByJS/CheckingError/` — mọi logic Checking Error ở đây (kể cả HTML/CSS/JS media).
2. **Không clone** `entityResolver.js`. Không sửa thuật toán resolver / hover / ctrl+click.
3. **Chỉ require read-only:**
   - `../entityResolver` → `getEntitiesForFile`, `resolveFboXmlEntities`, `readFileContent`
   - `../../TreeFile/AppDataPathHelper` → class hiện có
4. **Biến local / tham số tạm: snake_case.** Giữ nguyên tên API VS Code / class export hiện có.
5. **UI tiếng Việt.**
6. **Không** dùng Problems / Diagnostics.
7. **Không** hỏi ghi đè khi Generate (Table 1 = file đích đang thiếu → chưa tồn tại).
8. Nguồn là **project root** hợp lệ kiểu TreeFile: `new AppDataPathHelper(anyFileInside).getProjectPath()` logic — validate bằng cách: path nguồn + một relative test, hoặc: tạo helper `is_valid_project_root(folder)` = tồn tại folder và có cấu trúc `CustomerPro` khi gắn với path mẫu `path.join(folder, 'App_Data')` hoặc kiểm tra:  
   `helper.filePath = path.join(folder, 'App_Data', 'Controllers', '_probe.xml'); helper.getProjectPath() === path.normalize(folder)`  
   **Cách chuẩn trong plan (bắt buộc dùng):**
   ```js
   function is_valid_project_root(folder_path) {
       if (!folder_path || !fs.existsSync(folder_path)) return false;
       const probe = path.join(folder_path, 'App_Data', 'Controllers', 'Dir', '_fbo_probe.xml');
       const helper = new AppDataPathHelper(probe);
       const project_path = helper.getProjectPath();
       if (!project_path) return false;
       return path.normalize(project_path).toLowerCase() === path.normalize(folder_path).toLowerCase();
   }
   ```
   Nếu project root thực tế không luôn chứa `App_Data` ngay dưới root nhưng `getProjectPath` vẫn trả về đúng khi file thật nằm trong tree — thì validate bằng: user chọn folder F; với mỗi file XML đang check, `getPathAfterProject()` của file đó phải có `parts[0]` và `path.join(F, parts[1])` là cách map. **Validate nguồn khi chọn:**
   ```js
   function is_valid_project_root(folder_path, sample_file_in_current_project) {
       if (!folder_path || !fs.existsSync(folder_path) || !fs.statSync(folder_path).isDirectory()) return false;
       const helper = new AppDataPathHelper(sample_file_in_current_project);
       const parts = helper.getPathAfterProject();
       if (!parts || parts.length < 2) return false;
       // Nguồn hợp lệ nếu cùng “kiểu” project: ghép relative của sample vào nguồn phải ra path tuyệt đối hợp lệ (không cần file tồn tại)
       const mapped = path.join(folder_path, parts[1]);
       // Thêm: folder_path normalize không rỗng và không bằng project hiện tại bắt buộc — cho phép bằng cũng OK
       return mapped.length > folder_path.length;
   }
   ```
   **Gemini dùng hàm thứ hai** (cần `sample_file` từ selection). Nếu selection trống khi đổi nguồn trong webview, dùng `checked_files[0]` đã lưu trên panel.
9. Lookup nguồn: **index 0 = Nguồn 1**, rồi 2, 3…; tìm thấy thì **dừng**.
10. WebView **chỉ mở khi có lỗi**. Không lỗi → `showInformationMessage('Không phát hiện lỗi entity.')`.

---

## File map (tạo / sửa)

| Path | Action | Trách nhiệm |
|------|--------|-------------|
| `src/ReadXMLByJS/CheckingError/index.js` | Create | `registerCheckingError(context, treeDataProvider)` |
| `src/ReadXMLByJS/CheckingError/entityResolverChecking.js` | Create | Check lỗi + short XML label + gắn nguồn cho missing |
| `src/ReadXMLByJS/CheckingError/SourcePathHelper.js` | Create | validate root, relative map, resolve path bên nguồn |
| `src/ReadXMLByJS/CheckingError/LinkGenerateService.js` | Create | copy missing files + open in IDE |
| `src/ReadXMLByJS/CheckingError/CheckingErrorCommand.js` | Create | entry command: selection → nguồn 1 → check → open panel |
| `src/ReadXMLByJS/CheckingError/CheckingErrorPanel.js` | Create | WebviewPanel, message bridge, re-check, Generate, Check |
| `src/ReadXMLByJS/CheckingError/media/checkingError.html` | Create | layout |
| `src/ReadXMLByJS/CheckingError/media/checkingError.css` | Create | style |
| `src/ReadXMLByJS/CheckingError/media/checkingError.js` | Create | UI logic webview |
| `src/extension.js` | Modify | 2 dòng: require + `registerCheckingError(context, treeDataProvider)` |
| `package.json` | Modify | command + menu **đầu** context file |

**CẤM sửa:** `entityResolver.js`, `EntityHoverProvider.js`, `EntityDefinitionProvider.js`, `AppDataPathHelper.js` (chỉ require dùng), `ContextMenu.js` (không đăng ký trùng command ở đây).

---

## Data contracts (Gemini phải giữ đúng tên field)

### Input check
```js
/**
 * @param {string[]} file_paths - absolute XML paths đang chọn
 * @param {string[]} source_roots - project roots nguồn (đã validate), thứ tự ưu tiên
 */
```

### Output `checkEntityErrors(...)`
```js
{
  checked_files: string[],           // absolute paths đã check
  errors: Array<{                    // mọi lỗi (cho debug / future)
    type: 'missing_file' | 'undeclared_entity',
    message: string,
    xml_short: string,               // "Dir/A.xml"
    xml_path: string,                // absolute file đang check
    entity_name?: string,
    missing_path?: string,           // absolute đích thiếu
    system_url?: string,
    is_parameter?: boolean
  }>,
  table1_missing: Array<{
    xml_short: string,
    xml_path: string,
    missing_path: string,            // absolute path đích đang thiếu ở project hiện tại
    relative_path: string,           // relative sau project root hiện tại
    system_url: string,
    entity_name: string,
    is_parameter: boolean,
    source_index: number | null,     // 0-based; null = không tìm thấy
    source_label: string,            // "Nguồn 1" | "Nguồn 2" | "Không tìm thấy"
    source_file_path: string | null  // absolute file bên nguồn nếu tìm thấy
  }>,
  table2_entities: Array<{
    xml_short: string,
    xml_path: string,
    entity_name: string,
    status: 'ok' | 'missing',        // ok = tìm thấy khai báo bên nguồn
    source_index: number | null,
    source_label: string,            // "Nguồn 1" | ... | "Không tìm thấy"
    decl_file: string | null,        // absolute file khai báo bên nguồn
    decl_line: number | null,        // 1-based line (giống entityDecl.line)
    decl_is_system: boolean,         // true nếu SYSTEM + sourceFile
    decl_system_file: string | null  // entityDecl.sourceFile nếu SYSTEM
  }>,
  table3_xml_errors: Array<{
    xml_short: string,
    xml_path: string,
    missing_count: number,
    undeclared_count: number
  }>,
  summary: {
    total: number,
    missing_count: number,
    undeclared_count: number,
    all_missing_have_source: boolean  // true => enable Generate
  }
}
```

### Webview ↔ Extension messages

**Extension → Webview (`webview.postMessage`):**
```js
{ type: 'state', payload: {
    sources: string[],               // roots hiện tại
    result: <output checkEntityErrors>,
    generate_enabled: boolean,
    status_text?: string
}}
```

**Webview → Extension (`acquireVsCodeApi().postMessage`):**
```js
{ type: 'pick_source', source_index: number }
{ type: 'add_source' }
{ type: 'set_source', source_index: number, path: string }  // optional nếu gõ tay
{ type: 'remove_source', source_index: number }             // optional YAGNI: có thể bỏ Task đầu
{ type: 'run_check' }                                      // nút Checking Error trong WV
{ type: 'generate' }
{ type: 'open_entity_decl', row_index: number }            // nút Check Table 2
{ type: 'open_file', file_path: string }                   // optional click XML
```

---

### Task 1: `SourcePathHelper.js`

**Files:**
- Create: `src/ReadXMLByJS/CheckingError/SourcePathHelper.js`

**Produces:**
```js
module.exports = {
  is_valid_project_root,
  get_relative_after_project,
  map_to_source,
  get_xml_short_name,
  find_in_sources_by_relative
};
```

- [ ] **Step 1: Implement helpers**

```js
const fs = require('fs');
const path = require('path');
const AppDataPathHelper = require('../../TreeFile/AppDataPathHelper');

function is_valid_project_root(folder_path, sample_file_in_current_project) {
    if (!folder_path || !fs.existsSync(folder_path) || !fs.statSync(folder_path).isDirectory()) {
        return false;
    }
    if (!sample_file_in_current_project) return false;
    const helper = new AppDataPathHelper(sample_file_in_current_project);
    const parts = helper.getPathAfterProject();
    if (!parts || parts.length < 2) return false;
    const mapped = path.join(folder_path, parts[1]);
    return mapped.length > folder_path.length;
}

function get_relative_after_project(absolute_path) {
    const helper = new AppDataPathHelper(absolute_path);
    const parts = helper.getPathAfterProject();
    if (!parts || parts.length < 2) return null;
    return { project_path: parts[0], relative_path: parts[1] };
}

function map_to_source(source_root, relative_path) {
    return path.join(source_root, relative_path);
}

/**
 * Dir/A.xml hoặc Grid/B.xml — lấy đoạn sau Controllers\ nếu có; không thì 2 segment cuối.
 */
function get_xml_short_name(absolute_path) {
    const norm = absolute_path.replace(/\//g, '\\');
    const lower = norm.toLowerCase();
    const marker = '\\controllers\\';
    const idx = lower.lastIndexOf(marker);
    if (idx !== -1) {
        return norm.substring(idx + marker.length).replace(/\\/g, '/');
    }
    const parts = norm.split('\\').filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    return path.basename(absolute_path);
}

/**
 * @param {string[]} source_roots
 * @param {string} relative_path
 * @returns {{ source_index: number, source_file_path: string } | null}
 */
function find_in_sources_by_relative(source_roots, relative_path) {
    for (let i = 0; i < source_roots.length; i++) {
        const root = source_roots[i];
        if (!root) continue;
        const candidate = map_to_source(root, relative_path);
        if (fs.existsSync(candidate)) {
            return { source_index: i, source_file_path: candidate };
        }
    }
    return null;
}

function source_label_from_index(source_index) {
    if (source_index === null || source_index === undefined || source_index < 0) {
        return 'Không tìm thấy';
    }
    return `Nguồn ${source_index + 1}`;
}

module.exports = {
    is_valid_project_root,
    get_relative_after_project,
    map_to_source,
    get_xml_short_name,
    find_in_sources_by_relative,
    source_label_from_index
};
```

- [ ] **Step 2: Manual sanity** — gọi thử `get_xml_short_name` với path thật `...\Controllers\Dir\AITran.xml` → `Dir/AITran.xml`.

- [ ] **Step 3: Commit** (nếu được phép)
```bash
git add src/ReadXMLByJS/CheckingError/SourcePathHelper.js
git commit -m "feat(CheckingError): add SourcePathHelper for project root mapping"
```

---

### Task 2: `entityResolverChecking.js` (chỉ check lỗi)

**Files:**
- Create: `src/ReadXMLByJS/CheckingError/entityResolverChecking.js`

**Consumes:** `../entityResolver`, `./SourcePathHelper`  
**Produces:** `checkEntityErrors(file_paths, source_roots)`

- [ ] **Step 1: Skeleton + builtins**

```js
const fs = require('fs');
const path = require('path');
const { resolveFboXmlEntities, readFileContent, getEntitiesForFile } = require('../entityResolver');
const {
    get_relative_after_project,
    get_xml_short_name,
    find_in_sources_by_relative,
    source_label_from_index,
    map_to_source
} = require('./SourcePathHelper');

const BUILTIN_GENERAL_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);

function checkEntityErrors(file_paths, source_roots) {
    const roots = Array.isArray(source_roots) ? source_roots.filter(Boolean) : [];
    const list = Array.isArray(file_paths) ? file_paths.filter(Boolean) : [];
    const errors = [];
    const table1_missing = [];
    const table2_entities = [];
    const seen_missing = new Set();
    const seen_undeclared = new Set();
    const per_xml = new Map(); // xml_path -> { missing_count, undeclared_count, xml_short }

    for (const file_path of list) {
        check_one_file(file_path, roots, errors, table1_missing, table2_entities, seen_missing, seen_undeclared, per_xml);
    }

    const table3_xml_errors = [];
    for (const [xml_path, info] of per_xml.entries()) {
        if (info.missing_count > 0 || info.undeclared_count > 0) {
            table3_xml_errors.push({
                xml_short: info.xml_short,
                xml_path,
                missing_count: info.missing_count,
                undeclared_count: info.undeclared_count
            });
        }
    }

    const missing_count = table1_missing.length;
    const undeclared_count = table2_entities.length;
    const all_missing_have_source = missing_count === 0
        ? true
        : table1_missing.every(r => r.source_index !== null);

    return {
        checked_files: list,
        errors,
        table1_missing,
        table2_entities,
        table3_xml_errors,
        summary: {
            total: missing_count + undeclared_count,
            missing_count,
            undeclared_count,
            all_missing_have_source
        }
    };
}

module.exports = { checkEntityErrors };
```

- [ ] **Step 2: `check_one_file` — missing SYSTEM files**

Dùng `resolveFboXmlEntities(file_path)` (đi sâu sẵn). Duyệt `generalEntities` + `parameterEntities`:

```js
function ensure_xml_bucket(per_xml, xml_path, xml_short) {
    if (!per_xml.has(xml_path)) {
        per_xml.set(xml_path, { xml_short, missing_count: 0, undeclared_count: 0 });
    }
    return per_xml.get(xml_path);
}

function check_one_file(file_path, roots, errors, table1_missing, table2_entities, seen_missing, seen_undeclared, per_xml) {
    const xml_short = get_xml_short_name(file_path);
    const bucket = ensure_xml_bucket(per_xml, file_path, xml_short);

    if (!fs.existsSync(file_path)) {
        errors.push({
            type: 'missing_file',
            message: `File chọn không tồn tại: ${file_path}`,
            xml_short,
            xml_path: file_path,
            missing_path: file_path
        });
        bucket.missing_count++;
        return;
    }

    const { generalEntities, parameterEntities } = resolveFboXmlEntities(file_path);

    const collect_missing = (entities_map, is_parameter) => {
        for (const entity_name of Object.keys(entities_map || {})) {
            const ent = entities_map[entity_name];
            if (!ent || !ent.systemUrl) continue;
            const missing_path = ent.sourceFile;
            if (!missing_path || fs.existsSync(missing_path)) continue;

            const key = path.normalize(missing_path).toLowerCase();
            if (seen_missing.has(key)) continue;
            seen_missing.add(key);

            const rel_info = get_relative_after_project(missing_path);
            const relative_path = rel_info ? rel_info.relative_path : null;
            let source_index = null;
            let source_file_path = null;
            if (relative_path) {
                const found = find_in_sources_by_relative(roots, relative_path);
                if (found) {
                    source_index = found.source_index;
                    source_file_path = found.source_file_path;
                }
            }

            const row = {
                xml_short,
                xml_path: file_path,
                missing_path,
                relative_path: relative_path || '',
                system_url: ent.systemUrl,
                entity_name,
                is_parameter,
                source_index,
                source_label: source_label_from_index(source_index),
                source_file_path
            };
            table1_missing.push(row);
            bucket.missing_count++;
            errors.push({
                type: 'missing_file',
                message: `Thiếu file SYSTEM: ${missing_path}`,
                xml_short,
                xml_path: file_path,
                entity_name,
                missing_path,
                system_url: ent.systemUrl,
                is_parameter
            });
        }
    };

    collect_missing(generalEntities, false);
    collect_missing(parameterEntities, true);

    // undeclared — Step 3
    scan_undeclared(file_path, xml_short, generalEntities, roots, errors, table2_entities, seen_undeclared, bucket);
}
```

- [ ] **Step 3: Undeclared `&entity;` + đối chiếu nguồn (Table 2)**

```js
function collect_candidate_scan_paths(root_file_path, generalEntities, parameterEntities) {
    const set = new Set([root_file_path]);
    const add = (p) => { if (p && fs.existsSync(p)) set.add(p); };
    for (const name of Object.keys(generalEntities || {})) {
        add(generalEntities[name].sourceFile);
    }
    for (const name of Object.keys(parameterEntities || {})) {
        add(parameterEntities[name].sourceFile);
    }
    return [...set];
}

function scan_undeclared(file_path, xml_short, generalEntities, parameterEntities, roots, errors, table2_entities, seen_undeclared, bucket) {
    const candidate_paths = collect_candidate_scan_paths(file_path, generalEntities, parameterEntities);
    const entity_ref_re = /&([A-Za-z_][\w.-]*);/g;

    const undeclared_names = new Set();

    for (const scan_path of candidate_paths) {
        let content = '';
        try {
            content = readFileContent(scan_path);
        } catch (e) {
            continue;
        }
        entity_ref_re.lastIndex = 0;
        let match;
        while ((match = entity_ref_re.exec(content)) !== null) {
            const entity_name = match[1];
            if (BUILTIN_GENERAL_ENTITIES.has(entity_name)) continue;
            if (generalEntities[entity_name]) continue;
            undeclared_names.add(entity_name);
        }
    }

    for (const entity_name of undeclared_names) {
        const dedupe_key = `${path.normalize(file_path).toLowerCase()}|${entity_name}`;
        if (seen_undeclared.has(dedupe_key)) continue;
        seen_undeclared.add(dedupe_key);

        // Đối chiếu nguồn: file cùng relative path bên nguồn → getEntitiesForFile
        let status = 'missing';
        let source_index = null;
        let decl_file = null;
        let decl_line = null;
        let decl_is_system = false;
        let decl_system_file = null;

        const rel_info = get_relative_after_project(file_path);
        if (rel_info && roots.length) {
            for (let i = 0; i < roots.length; i++) {
                const root = roots[i];
                if (!root) continue;
                const source_xml = map_to_source(root, rel_info.relative_path);
                if (!fs.existsSync(source_xml)) continue;

                let entities_on_source = null;
                try {
                    entities_on_source = getEntitiesForFile(source_xml);
                } catch (e) {
                    continue;
                }
                const ent = entities_on_source ? entities_on_source[entity_name] : null;
                if (!ent) continue;

                status = 'ok';
                source_index = i;
                decl_is_system = !!(ent.systemUrl && ent.sourceFile);
                decl_system_file = decl_is_system ? ent.sourceFile : null;
                // Giống EntityDefinitionProvider:
                // SYSTEM + file tồn tại → nhảy sourceFile line 0
                // else → declaredInFile + line
                if (decl_is_system && ent.sourceFile && fs.existsSync(ent.sourceFile)) {
                    decl_file = ent.sourceFile;
                    decl_line = 1;
                } else if (ent.declaredInFile && ent.line > 0) {
                    decl_file = ent.declaredInFile;
                    decl_line = ent.line;
                } else {
                    decl_file = source_xml;
                    decl_line = ent.line > 0 ? ent.line : 1;
                }
                break; // ưu tiên nguồn nhỏ hơn
            }
        }

        table2_entities.push({
            xml_short,
            xml_path: file_path,
            entity_name,
            status,
            source_index,
            source_label: status === 'ok' ? source_label_from_index(source_index) : 'Không tìm thấy',
            decl_file,
            decl_line,
            decl_is_system,
            decl_system_file
        });
        bucket.undeclared_count++;
        errors.push({
            type: 'undeclared_entity',
            message: `Entity chưa khai báo: &${entity_name};`,
            xml_short,
            xml_path: file_path,
            entity_name
        });
    }
}
```

**Nhớ:** trong `check_one_file` gọi:
```js
scan_undeclared(file_path, xml_short, generalEntities, parameterEntities, roots, errors, table2_entities, seen_undeclared, bucket);
```

- [ ] **Step 4: Self-check thủ công**
  - File sạch + roots rỗng → `summary.total === 0`
  - SYSTEM trỏ file không tồn tại → có `table1_missing`
  - `&foo;` chưa khai báo → `table2_entities`
  - `&amp;` không vào table2
  - Có roots và file tồn tại bên nguồn → `source_label` = `Nguồn 1`

- [ ] **Step 5: Commit**
```bash
git add src/ReadXMLByJS/CheckingError/entityResolverChecking.js
git commit -m "feat(CheckingError): entityResolverChecking builds table1/2/3 data"
```

---

### Task 3: `LinkGenerateService.js`

**Files:**
- Create: `src/ReadXMLByJS/CheckingError/LinkGenerateService.js`

**Produces:** `async function generate_missing_files(table1_missing, treeDataProvider)`

- [ ] **Step 1: Implement copy + open**

```js
const fs = require('fs');
const path = require('path');
const vscode = require('vscode');

/**
 * Chỉ copy các row có source_index !== null && source_file_path.
 * Không hỏi ghi đè (đích đang thiếu).
 * @returns {{ copied: number, failed: number, pasted_paths: string[], opened_uris: vscode.Uri[], notify_group_root: string }}
 */
async function generate_missing_files(table1_missing, treeDataProvider) {
    let copied = 0;
    let failed = 0;
    const pasted_paths = [];
    const opened_uris = [];
    let notify_group_root = '';

    const rows = (table1_missing || []).filter(r => r.source_index !== null && r.source_file_path);

    for (const row of rows) {
        const dest_path = row.missing_path;
        const source_path = row.source_file_path;
        if (!fs.existsSync(source_path)) {
            failed++;
            continue;
        }
        // An toàn: nếu vì lý do nào đó đích đã có → bỏ qua (không hỏi)
        if (fs.existsSync(dest_path)) {
            continue;
        }
        try {
            fs.mkdirSync(path.dirname(dest_path), { recursive: true });
            fs.copyFileSync(source_path, dest_path);
            copied++;
            pasted_paths.push(dest_path);
            opened_uris.push(vscode.Uri.file(dest_path));
            if (!notify_group_root) {
                const AppDataPathHelper = require('../../TreeFile/AppDataPathHelper');
                const helper = new AppDataPathHelper(dest_path);
                const parts = helper.getPathAfterProject();
                if (parts && parts.length >= 1) notify_group_root = parts[0];
            }
        } catch (err) {
            failed++;
            vscode.window.showErrorMessage(`❌ Lỗi copy: ${source_path} → ${err.message}`);
        }
    }

    for (const uri of opened_uris) {
        try {
            await vscode.window.showTextDocument(uri, { preview: false, viewColumn: vscode.ViewColumn.Active });
        } catch (e) { /* ignore */ }
    }

    if (copied > 0 && notify_group_root && treeDataProvider && typeof treeDataProvider.notifyGroupFilesPasted === 'function') {
        await treeDataProvider.notifyGroupFilesPasted(notify_group_root, {
            count: copied,
            paths: pasted_paths,
            openedUris: opened_uris
        });
    }

    return { copied, failed, pasted_paths, opened_uris, notify_group_root };
}

module.exports = { generate_missing_files };
```

- [ ] **Step 2: Commit**
```bash
git add src/ReadXMLByJS/CheckingError/LinkGenerateService.js
git commit -m "feat(CheckingError): LinkGenerateService copies missing files from sources"
```

---

### Task 4: Webview media (HTML/CSS/JS)

**Files:**
- Create: `src/ReadXMLByJS/CheckingError/media/checkingError.html`
- Create: `src/ReadXMLByJS/CheckingError/media/checkingError.css`
- Create: `src/ReadXMLByJS/CheckingError/media/checkingError.js`

**Layout bắt buộc:**

```
[ Nguồn 1: <input readonly> ] [Browse]   [ Nguồn 2: <input> ] [Browse]
[ + Thêm nguồn ]     [ Checking Error ]

+------------------+  +------------------------------------------+
| Table 3          |  | Table 1: XML | File thiếu | Nguồn        |
| XML còn lỗi      |  | ...                                      |
|                  |  | [Generate] (disabled theo state)         |
+------------------+  +------------------------------------------+

+------------------------------------------------------------------+
| Table 2: XML | Entity | Trạng thái (OK/X + label) | [Check]     |
+------------------------------------------------------------------+
```

- [ ] **Step 1: `checkingError.html`**

Dùng placeholder `{{CSP_META}}`, `{{STYLE_URI}}`, `{{SCRIPT_URI}}` — Panel sẽ replace (giống pattern XmlFlatPreview: có thể inline CSS/JS bằng đọc file + replace, **hoặc** dùng `webview.asWebviewUri`).

**Gemini dùng cách XmlFlatPreview đơn giản:** Panel đọc html/css/js từ disk, inject CSP + replace `{{STYLE}}` / `{{SCRIPT}}` inline **hoặc** link asWebviewUri. Chọn **asWebviewUri** (rõ ràng hơn):

```html
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  {{CSP_META}}
  <title>Checking Error</title>
  <link rel="stylesheet" href="{{STYLE_URI}}" />
</head>
<body>
  <div class="toolbar sources" id="sources-bar"></div>
  <div class="toolbar actions">
    <button id="btn-add-source">+ Thêm nguồn</button>
    <button id="btn-run-check" class="primary">Checking Error</button>
  </div>

  <div class="row-tables">
    <section class="panel">
      <h3>Table 3 — XML còn lỗi</h3>
      <table id="table3"><thead><tr><th>XML</th><th>Thiếu ref</th><th>Ent lỗi</th></tr></thead><tbody></tbody></table>
    </section>
    <section class="panel">
      <h3>Table 1 — Ref file thiếu</h3>
      <table id="table1"><thead><tr><th>XML</th><th>File thiếu</th><th>Nguồn</th></tr></thead><tbody></tbody></table>
      <button id="btn-generate" disabled>Generate</button>
    </section>
  </div>

  <section class="panel">
    <h3>Table 2 — Entity chưa khai báo</h3>
    <table id="table2">
      <thead><tr><th>XML</th><th>Entity</th><th>Trạng thái</th><th></th></tr></thead>
      <tbody></tbody>
    </table>
  </section>

  <div id="status" class="status"></div>
  <script src="{{SCRIPT_URI}}"></script>
</body>
</html>
```

- [ ] **Step 2: `checkingError.css`**

Layout 2 cột cho Table3 | Table1; table border collapse; `.ok` xanh / `.bad` đỏ; toolbar flex wrap. Không cần đẹp phức tạp — rõ ràng, đọc được.

- [ ] **Step 3: `checkingError.js`**

```js
(function () {
    const vscode = acquireVsCodeApi();
    let state = { sources: ['', ''], result: null, generate_enabled: false };

    const el_sources = document.getElementById('sources-bar');
    const el_t1 = document.querySelector('#table1 tbody');
    const el_t2 = document.querySelector('#table2 tbody');
    const el_t3 = document.querySelector('#table3 tbody');
    const btn_generate = document.getElementById('btn-generate');
    const btn_add = document.getElementById('btn-add-source');
    const btn_check = document.getElementById('btn-run-check');
    const el_status = document.getElementById('status');

    function render_sources() {
        el_sources.innerHTML = '';
        (state.sources || []).forEach((src, index) => {
            const wrap = document.createElement('div');
            wrap.className = 'source-item';
            wrap.innerHTML = `<label>Nguồn ${index + 1}</label>
                <input type="text" data-index="${index}" value="${escape_attr(src || '')}" />
                <button data-pick="${index}">Browse</button>`;
            el_sources.appendChild(wrap);
        });
        el_sources.querySelectorAll('button[data-pick]').forEach(btn => {
            btn.onclick = () => vscode.postMessage({ type: 'pick_source', source_index: Number(btn.getAttribute('data-pick')) });
        });
        el_sources.querySelectorAll('input[data-index]').forEach(inp => {
            inp.onchange = () => vscode.postMessage({
                type: 'set_source',
                source_index: Number(inp.getAttribute('data-index')),
                path: inp.value.trim()
            });
        });
    }

    function escape_attr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function render_tables() {
        const result = state.result || { table1_missing: [], table2_entities: [], table3_xml_errors: [] };
        el_t1.innerHTML = '';
        (result.table1_missing || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escape_attr(row.xml_short)}</td>
                <td title="${escape_attr(row.missing_path)}">${escape_attr(row.relative_path || row.missing_path)}</td>
                <td>${escape_attr(row.source_label)}</td>`;
            el_t1.appendChild(tr);
        });

        el_t3.innerHTML = '';
        (result.table3_xml_errors || []).forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${escape_attr(row.xml_short)}</td>
                <td>${row.missing_count}</td><td>${row.undeclared_count}</td>`;
            el_t3.appendChild(tr);
        });

        el_t2.innerHTML = '';
        (result.table2_entities || []).forEach((row, row_index) => {
            const tr = document.createElement('tr');
            const icon = row.status === 'ok' ? '✔ OK' : '✖';
            const klass = row.status === 'ok' ? 'ok' : 'bad';
            const detail = row.status === 'ok'
                ? `${row.source_label}: ${row.decl_file || ''} :${row.decl_line || ''}`
                : row.source_label;
            tr.innerHTML = `<td>${escape_attr(row.xml_short)}</td>
                <td>&amp;${escape_attr(row.entity_name)};</td>
                <td class="${klass}">${icon} ${escape_attr(detail)}</td>
                <td><button data-check="${row_index}" ${row.status !== 'ok' ? 'disabled' : ''}>Check</button></td>`;
            el_t2.appendChild(tr);
        });
        el_t2.querySelectorAll('button[data-check]').forEach(btn => {
            btn.onclick = () => vscode.postMessage({
                type: 'open_entity_decl',
                row_index: Number(btn.getAttribute('data-check'))
            });
        });

        btn_generate.disabled = !state.generate_enabled;
    }

    function apply_state(msg) {
        state.sources = msg.payload.sources || state.sources;
        state.result = msg.payload.result;
        state.generate_enabled = !!msg.payload.generate_enabled;
        el_status.textContent = msg.payload.status_text || '';
        render_sources();
        render_tables();
    }

    window.addEventListener('message', event => {
        const msg = event.data;
        if (msg && msg.type === 'state') apply_state(msg);
    });

    btn_add.onclick = () => vscode.postMessage({ type: 'add_source' });
    btn_check.onclick = () => vscode.postMessage({ type: 'run_check' });
    btn_generate.onclick = () => vscode.postMessage({ type: 'generate' });
})();
```

- [ ] **Step 4: Commit**
```bash
git add src/ReadXMLByJS/CheckingError/media
git commit -m "feat(CheckingError): webview media layout for tables and sources"
```

---

### Task 5: `CheckingErrorPanel.js`

**Files:**
- Create: `src/ReadXMLByJS/CheckingError/CheckingErrorPanel.js`

**Pattern:** giống `XmlFlatPreviewPanel` — singleton panel (1 panel Checking Error toàn extension).

- [ ] **Step 1: Class skeleton**

```js
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { checkEntityErrors } = require('./entityResolverChecking');
const { is_valid_project_root, source_label_from_index } = require('./SourcePathHelper');
const { generate_missing_files } = require('./LinkGenerateService');

let current_panel = null;

class CheckingErrorPanel {
    static create_or_show(context, treeDataProvider, checked_files, sources) {
        if (current_panel) {
            current_panel.reveal();
            current_panel.checked_files = checked_files;
            current_panel.sources = normalize_sources(sources);
            current_panel.run_check_and_render('Đã mở lại Checking Error');
            return current_panel;
        }
        current_panel = new CheckingErrorPanel(context, treeDataProvider, checked_files, sources);
        return current_panel;
    }

    constructor(context, treeDataProvider, checked_files, sources) {
        this.context = context;
        this.treeDataProvider = treeDataProvider;
        this.checked_files = checked_files || [];
        this.sources = normalize_sources(sources);
        this.last_result = null;
        this.disposables = [];

        this.panel = vscode.window.createWebviewPanel(
            'fboCheckingError',
            'Checking Error',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'src', 'ReadXMLByJS', 'CheckingError', 'media'))
                ]
            }
        );

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.onDidReceiveMessage(msg => this.on_message(msg), null, this.disposables);
        this.panel.webview.html = this.get_html();
        this.run_check_and_render();
    }

    reveal() {
        this.panel.reveal(vscode.ViewColumn.Beside);
    }

    dispose() {
        current_panel = null;
        while (this.disposables.length) {
            try { this.disposables.pop().dispose(); } catch (e) {}
        }
    }
}

function normalize_sources(sources) {
    const list = Array.isArray(sources) ? sources.slice() : [];
    while (list.length < 2) list.push('');
    return list;
}

module.exports = { CheckingErrorPanel };
```

- [ ] **Step 2: `get_html` + CSP**

```js
get_html() {
    const media_root = path.join(this.context.extensionPath, 'src', 'ReadXMLByJS', 'CheckingError', 'media');
    let html = fs.readFileSync(path.join(media_root, 'checkingError.html'), 'utf8');
    const style_uri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(media_root, 'checkingError.css')));
    const script_uri = this.panel.webview.asWebviewUri(vscode.Uri.file(path.join(media_root, 'checkingError.js')));
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource}; script-src ${this.panel.webview.cspSource};">`;
    return html
        .replace('{{CSP_META}}', csp)
        .replace('{{STYLE_URI}}', String(style_uri))
        .replace('{{SCRIPT_URI}}', String(script_uri));
}
```

- [ ] **Step 3: `run_check_and_render` + `post_state`**

```js
run_check_and_render(status_text) {
    const valid_roots = this.sources.filter((s, idx) => {
        if (!s) return false;
        const sample = this.checked_files[0];
        return is_valid_project_root(s, sample);
    });
    // Lưu ý: checkEntityErrors cần đủ slots theo index để source_index khớp label.
    // Truyền this.sources nguyên (kể cả rỗng) để index ổn định; find_in_sources bỏ qua root rỗng.
    this.last_result = checkEntityErrors(this.checked_files, this.sources);
    const generate_enabled = !!(
        this.last_result.summary.missing_count > 0 &&
        this.last_result.summary.all_missing_have_source
    );
    this.panel.webview.postMessage({
        type: 'state',
        payload: {
            sources: this.sources,
            result: this.last_result,
            generate_enabled,
            status_text: status_text || ''
        }
    });
}
```

**Rule Generate:**  
- `missing_count === 0` → Generate **disabled** (không còn gì để copy).  
- `missing_count > 0` && mọi row có `source_index !== null` → **enabled**.  
- Còn 1 row `Không tìm thấy` → **disabled**.

- [ ] **Step 4: `on_message` handlers**

```js
async on_message(msg) {
    if (!msg || !msg.type) return;
    switch (msg.type) {
        case 'pick_source': {
            const picked = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: `Chọn Nguồn ${(msg.source_index || 0) + 1}`
            });
            if (!picked || !picked[0]) return;
            const folder = picked[0].fsPath;
            const sample = this.checked_files[0];
            if (!is_valid_project_root(folder, sample)) {
                vscode.window.showErrorMessage('Path nguồn không hợp lệ (không map được kiểu group CustomerPro như TreeFile).');
                return;
            }
            this.sources[msg.source_index] = folder;
            this.run_check_and_render(`Đã cập nhật Nguồn ${msg.source_index + 1}`);
            break;
        }
        case 'set_source': {
            const folder = (msg.path || '').trim();
            if (!folder) {
                this.sources[msg.source_index] = '';
                this.run_check_and_render();
                return;
            }
            const sample = this.checked_files[0];
            if (!is_valid_project_root(folder, sample)) {
                vscode.window.showErrorMessage('Path nguồn không hợp lệ.');
                return;
            }
            this.sources[msg.source_index] = folder;
            this.run_check_and_render();
            break;
        }
        case 'add_source': {
            this.sources.push('');
            this.post_sources_only(); // hoặc run_check_and_render
            this.run_check_and_render('Đã thêm nguồn mới');
            break;
        }
        case 'run_check': {
            this.run_check_and_render('Đã chạy lại Checking Error');
            break;
        }
        case 'generate': {
            if (!this.last_result || !this.last_result.summary.all_missing_have_source) {
                vscode.window.showWarningMessage('Chưa đủ nguồn cho mọi file thiếu — không thể Generate.');
                return;
            }
            const gen = await generate_missing_files(this.last_result.table1_missing, this.treeDataProvider);
            // BẮT BUỘC: tự chạy lại Checking Error
            this.run_check_and_render(`Generate xong: copy ${gen.copied}, lỗi ${gen.failed}. Đã check lại.`);
            break;
        }
        case 'open_entity_decl': {
            const row = this.last_result && this.last_result.table2_entities
                ? this.last_result.table2_entities[msg.row_index]
                : null;
            if (!row || row.status !== 'ok' || !row.decl_file) {
                vscode.window.showWarningMessage('Không có vị trí khai báo bên nguồn.');
                return;
            }
            const doc = await vscode.workspace.openTextDocument(row.decl_file);
            const editor = await vscode.window.showTextDocument(doc, { preview: false });
            const line = Math.max(0, (row.decl_line || 1) - 1);
            const pos = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            break;
        }
        default:
            break;
    }
}
```

- [ ] **Step 5: Commit**
```bash
git add src/ReadXMLByJS/CheckingError/CheckingErrorPanel.js
git commit -m "feat(CheckingError): Webview panel with check/generate/open decl"
```

---

### Task 6: `CheckingErrorCommand.js` + `index.js`

**Files:**
- Create: `src/ReadXMLByJS/CheckingError/CheckingErrorCommand.js`
- Create: `src/ReadXMLByJS/CheckingError/index.js`

- [ ] **Step 1: Command entry**

```js
const vscode = require('vscode');
const { checkEntityErrors } = require('./entityResolverChecking');
const { is_valid_project_root } = require('./SourcePathHelper');
const { CheckingErrorPanel } = require('./CheckingErrorPanel');

async function run_checking_error(context, treeDataProvider) {
    const tree_view = treeDataProvider && treeDataProvider.treeView;
    const selected = tree_view && tree_view.selection ? tree_view.selection : [];
    const file_paths = selected
        .filter(item => item && item.contextValue === 'file' && item.resourceUri)
        .map(item => item.resourceUri.fsPath);

    if (!file_paths.length) {
        vscode.window.showErrorMessage('Không có file XML nào được chọn trên fbo_file.');
        return;
    }

    // Dialog Nguồn 1 lần đầu
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Chọn Nguồn 1 (project root)'
    });
    if (!picked || !picked[0]) return;

    const source1 = picked[0].fsPath;
    if (!is_valid_project_root(source1, file_paths[0])) {
        vscode.window.showErrorMessage('Nguồn 1 không hợp lệ (phải là project root kiểu group TreeFile / CustomerPro).');
        return;
    }

    const sources = [source1, '']; // sẵn Nguồn 2 trống
    const result = checkEntityErrors(file_paths, sources);

    if (!result.summary.total) {
        vscode.window.showInformationMessage('Không phát hiện lỗi entity.');
        return;
    }

    CheckingErrorPanel.create_or_show(context, treeDataProvider, file_paths, sources);
}

module.exports = { run_checking_error };
```

- [ ] **Step 2: `index.js` register**

```js
const vscode = require('vscode');
const { run_checking_error } = require('./CheckingErrorCommand');

/**
 * @param {vscode.ExtensionContext} context
 * @param {*} treeDataProvider - TreeFileProvider (có treeView, notifyGroupFilesPasted)
 */
function registerCheckingError(context, treeDataProvider) {
    const disposable = vscode.commands.registerCommand('fboFile.CheckingError', async () => {
        await run_checking_error(context, treeDataProvider);
    });
    context.subscriptions.push(disposable);
}

module.exports = { registerCheckingError };
```

- [ ] **Step 3: Commit**
```bash
git add src/ReadXMLByJS/CheckingError/CheckingErrorCommand.js src/ReadXMLByJS/CheckingError/index.js
git commit -m "feat(CheckingError): register command entrypoint"
```

---

### Task 7: Wire `extension.js` + `package.json`

**Files:**
- Modify: `src/extension.js`
- Modify: `package.json`

- [ ] **Step 1: `extension.js`**

Thêm require cạnh XmlFlatPreview:
```js
const { registerCheckingError } = require('./ReadXMLByJS/CheckingError');
```

Sau `const contextMenu = new ContextMenuHandler(context, treeDataProvider);` (khoảng dòng 436) **hoặc** cạnh `registerXmlFlatPreview(context);`:
```js
registerCheckingError(context, treeDataProvider);
```

**Không** thêm handler vào `ContextMenu.js` (tránh double-register cùng command id).

- [ ] **Step 2: `package.json` — commands**

Trong `contributes.commands`, thêm (gần các `fboFile.*`):
```json
{
  "command": "fboFile.CheckingError",
  "title": "Checking Error"
}
```

- [ ] **Step 3: `package.json` — menu ĐẦU tiên cho file**

Trong `contributes.menus["view/item/context"]`, **chèn phần tử đầu** (trước `fboFile.openRevealFolder`):

```json
{
  "command": "fboFile.CheckingError",
  "when": "view == fbo_file && viewItem == file",
  "group": "navigation@0"
}
```

Các item file khác giữ `group: "navigation"` hoặc `navigation@1` — miễn Checking Error nằm trên cùng khi chuột phải file.

- [ ] **Step 4: Reload extension / cài lại theo workflow project**

- [ ] **Step 5: Commit**
```bash
git add src/extension.js package.json
git commit -m "feat(CheckingError): wire extension.js and package.json menu"
```

---

### Task 8: Acceptance test (Gemini phải tự chạy checklist)

- [ ] **A. Menu** — Chuột phải file trên `fbo_file` → **Checking Error** ở **đầu** menu.
- [ ] **B. Không lỗi** — Chọn XML sạch + nguồn hợp lệ → chỉ InformationMessage, **không** mở WebView.
- [ ] **C. Có lỗi** — Mở WebView; Nguồn 1 đã fill; Nguồn 2 trống; có Table 1/2/3.
- [ ] **D. Generate disable** — Còn 1 missing `Không tìm thấy` → Generate disabled.
- [ ] **E. Thêm nguồn / Browse** — Chọn nguồn đủ → mọi dòng Table 1 có `Nguồn N` → Generate enabled.
- [ ] **F. Generate** — Copy file thiếu → mở tab các file vừa copy → WebView tự refresh; Table 1 giảm/hết.
- [ ] **G. Lặp** — Nếu Table 1 còn thiếu → đổi/thêm nguồn → Checking Error → Generate lại.
- [ ] **H. Table 2 OK** — Entity có bên nguồn → ✔ + path/dòng; **Check** mở đúng file/dòng (giống ctrl+click semantics).
- [ ] **I. Table 2 X** — Không có bên mọi nguồn → ✖, nút Check disabled.
- [ ] **J. Không sửa** — `git diff` không đụng `entityResolver.js` / Hover / Definition / `AppDataPathHelper.js` / `ContextMenu.js`.
- [ ] **K. Built-in** — `&amp;` không nằm Table 2.

---

## Self-review (plan author)

| Yêu cầu design | Task |
|----------------|------|
| Folder CheckingError + wire nhẹ extension.js | Task 6–7 |
| Không sửa entityResolver | Global + Task 2 chỉ require |
| WebView chỉ khi có lỗi | Task 6 |
| Nguồn 1 dialog đầu + auto-fill | Task 6 + 5 |
| Nguồn 1+2 sẵn, + thêm nguồn | Task 4–5 |
| Table 1 + cột nguồn + Generate rule | Task 2, 4, 5 |
| Table 3 XML còn lỗi | Task 2, 4 |
| Table 2 OK/X + Check | Task 2, 5 |
| Generate → open → re-check | Task 3, 5 |
| Validate nguồn kiểu TreeFile | Task 1, 5, 6 |
| Menu đầu | Task 7 |
| Ưu tiên nguồn 1→2→… | Task 1–2 |

---

## Prompt đưa Gemini (copy nguyên)

```text
Implement FULL feature Checking Error theo đúng 2 file:

1) docs/superpowers/specs/2026-07-26-checking-error-design.md
2) docs/superpowers/plans/2026-07-26-checking-error-implementation.md

Quy tắc cứng:
- Tất cả code trong src/ReadXMLByJS/CheckingError/
- extension.js chỉ registerCheckingError(context, treeDataProvider)
- KHÔNG sửa entityResolver.js, EntityHoverProvider, EntityDefinitionProvider, AppDataPathHelper, ContextMenu.js
- Làm tuần tự Task 1 → 8, đánh checkbox
- Biến local snake_case
- WebView chỉ mở khi có lỗi
- Generate disable nếu còn missing chưa có nguồn; sau Generate phải auto re-check
- Không hỏi ghi đè
- Menu Checking Error ở đầu context menu file trên fbo_file

Sau khi xong: paste kết quả checklist Task 8 (A–K) Pass/Fail.
```

## Out of scope (Gemini BỎ QUA)

- Auto insert `<!ENTITY>` vào project hiện tại  
- Problems panel  
- Clone entityResolver  
- Đổi thuật toán hover/ctrl+click  
- Sửa ContextMenu.js để đăng ký trùng command  
