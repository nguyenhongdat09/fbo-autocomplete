// FBO Query Results — AG Grid Community, nhiều bảng xếp dọc (kiểu SSMS).

/**
 * @param {{ name?: string, type?: string }[]} columns
 * @param {any[][]} rows
 * @returns {Record<string, unknown>[]}
 */
function rowsToObjects(columns, rows) {
    if (!rows || !rows.length) return [];
    const names = (columns || []).map((c) => (c && c.name) || "");
    return rows.map((row) => {
        const o = {};
        names.forEach((name, i) => {
            if (name) o[name] = row[i];
        });
        return o;
    });
}

/**
 * Tự fit cột theo nội dung để tránh cột ngắn (vd: ky, nam) bị giãn quá lớn.
 * @param {any} api
 * @param {any} columnApi
 */
function fboAutoSizeColumnsByContent(api, columnApi) {
    if (!api) return;
    try {
        if (typeof api.autoSizeAllColumns === "function") {
            api.autoSizeAllColumns(false);
            return;
        }
        var cols =
            columnApi && typeof columnApi.getAllDisplayedColumns === "function"
                ? columnApi.getAllDisplayedColumns()
                : [];
        if (cols && cols.length && typeof columnApi.autoSizeColumns === "function") {
            columnApi.autoSizeColumns(cols, false);
        }
    } catch (err) {
        /* auto-size fail -> giữ width mặc định */
    }
}

/**
 * @param {Record<string, unknown>} params
 */
function renderMessages(params) {
    const container = document.getElementById("messagesContainer");
    if (!container) return;
    const messages = params.messages || [];
    const executionTime = params.executionTime != null ? params.executionTime : 0;

    let html = '<div class="messages-content">';
    html += `<div class="message-line info"><span class="message-icon">⏱️</span><span class="message-content">Execution time: ${escapeHtml(
        String(executionTime)
    )}ms</span></div>`;
    html += "<br>";

    messages.forEach((msg) => {
        const text = typeof msg === "string" ? msg : (msg && msg.message) || "";
        const mtype = typeof msg === "string" ? "info" : (msg && msg.type) || "info";
        let icon = "ℹ️";
        if (mtype === "error") icon = "❌";
        else if (mtype === "warning") icon = "⚠️";
        else if (mtype === "print") icon = "💬";
        else if (mtype === "system") icon = "📊";
        html += `<div class="message-line ${mtype}"><span class="message-icon">${icon}</span><span class="message-content">${escapeHtml(
            text
        )}</span></div>`;
    });
    html += "</div>";
    container.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function updateStatusBar(data) {
    const rowInfo = document.getElementById("rowInfo");
    const execEl = document.getElementById("executionTime");
    const dbEl = document.getElementById("dbInfo");
    const statsEl = document.getElementById("statisticsInfo");

    const sets = data.resultSets || [];
    const totalRows = sets.reduce((s, rs) => s + (rs.rowCount || 0), 0);
    if (rowInfo) {
        rowInfo.textContent =
            sets.length === 0
                ? "0 rows"
                : `${totalRows} row${totalRows !== 1 ? "s" : ""} in ${sets.length} result set${sets.length !== 1 ? "s" : ""}`;
    }
    if (execEl) execEl.textContent = `${data.executionTime != null ? data.executionTime : 0}ms`;
    if (dbEl) dbEl.textContent = data.database || "";
    if (statsEl) statsEl.textContent = "Col: -";
}

/**
 * @param {number} index1Based
 */
function updateColumnIndexStatus(index1Based) {
    const statsEl = document.getElementById("statisticsInfo");
    if (!statsEl) return;
    if (typeof index1Based === "number" && index1Based > 0) {
        statsEl.textContent = `Col: ${index1Based}`;
    } else {
        statsEl.textContent = "Col: -";
    }
}

/**
 * Cuộn vùng #tableContainer để batch (section) chứa grid đang tương tác vào vùng nhìn.
 * Trước đây gần giống hành vi khi focus gridHost; giữ lại sau khi bỏ focus container.
 * @param {HTMLElement|null} gridHostEl
 */
function scrollResultSectionIntoView(gridHostEl) {
    if (!gridHostEl || typeof gridHostEl.closest !== "function") return;
    const section = gridHostEl.closest(".fbo-ag-section");
    if (!section || typeof section.scrollIntoView !== "function") return;
    section.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

/**
 * Tab Results đang mở (không cướp Ctrl+C khi đang ở Messages).
 * @returns {boolean}
 */
function isResultsTabVisible() {
    const tab = document.getElementById("resultsTab");
    return !!(tab && tab.style.display !== "none");
}

/**
 * Ctrl/Cmd+C: copy ô đang focus (giống mục Copy trong menu chuột phải).
 */
function ensureGridCopyShortcutBound() {
    if (window.__fboGridCopyShortcutBound) return;
    window.__fboGridCopyShortcutBound = true;
    document.addEventListener(
        "keydown",
        function (e) {
            if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "c") return;
            if (!isResultsTabVisible()) return;
            const t = e.target;
            if (!t || typeof t.closest !== "function") return;
            if (!t.closest("#tableContainer")) return;

            let api = null;
            const host = t.closest(".fbo-ag-grid-host");
            if (host && host.__fboAgApi) {
                api = host.__fboAgApi;
            }
            if (!api) {
                const apis = window.__fboGridApis || [];
                for (let i = 0; i < apis.length; i++) {
                    const txt = getFocusedCellTextFromApi(apis[i]);
                    if (txt !== "") {
                        api = apis[i];
                        break;
                    }
                }
            }
            if (!api) return;
            const text = getFocusedCellTextFromApi(api);
            if (!text) return;
            e.preventDefault();
            e.stopPropagation();
            postCopy(text, "Đã copy ô hiện tại");
        },
        true
    );
}

/**
 * Hiển thị số theo scale SQL (SSMS: numeric/decimal/money).
 * @param {unknown} v
 * @param {number|undefined|null} sqlScale
 * @returns {string}
 */
function formatSqlCellDisplay(v, sqlScale) {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof sqlScale === "number" && sqlScale >= 0 && typeof v === "number" && Number.isFinite(v)) {
        return v.toFixed(sqlScale);
    }
    return String(v);
}

/**
 * Giá trị copy TSV — cùng quy tắc với ô grid khi có scale.
 * @param {unknown} v
 * @param {number|undefined|null} sqlScale
 * @returns {string}
 */
function formatCellForTsv(v, sqlScale) {
    return formatSqlCellDisplay(v, sqlScale);
}

/**
 * @param {string[]} columnFields
 * @param {Record<string, unknown>|null} row
 * @param {Record<string, number>|undefined} scaleByField
 * @returns {string}
 */
function rowToTsv(columnFields, row, scaleByField) {
    if (!row) return "";
    const map = scaleByField || {};
    return columnFields.map((f) => formatCellForTsv(row[f], map[f])).join("\t");
}

/**
 * @param {any} api
 * @returns {Record<string, unknown>|null}
 */
function getTargetRowData(api) {
    if (!api) return null;
    if (typeof api.getFocusedCell === "function") {
        const focused = api.getFocusedCell();
        if (focused != null && focused.rowIndex != null) {
            const node = api.getDisplayedRowAtIndex(focused.rowIndex);
            if (node && node.data) return node.data;
        }
    }
    if (typeof api.getSelectedRows === "function") {
        const sel = api.getSelectedRows();
        if (sel && sel.length > 0) return sel[0];
    }
    return null;
}

/**
 * @param {string} text
 * @param {string} hint
 */
function postCopy(text, hint) {
    if (window.vscode && typeof window.vscode.postMessage === "function") {
        window.vscode.postMessage({ command: "copyToClipboard", text, hint: hint || "Đã copy" });
        return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(text).catch(function () {});
    }
}

/**
 * @param {any} api
 * @returns {string}
 */
function getFocusedCellTextFromApi(api) {
    if (!api || typeof api.getFocusedCell !== "function") return "";
    const focused = api.getFocusedCell();
    if (!focused || !focused.column) return "";
    const field = focused.column.getColId();
    const rowNode = api.getDisplayedRowAtIndex(focused.rowIndex);
    if (!rowNode || !rowNode.data) return "";
    const cd = typeof focused.column.getColDef === "function" ? focused.column.getColDef() : null;
    const sqlScale = cd && typeof cd.fboSqlScale === "number" ? cd.fboSqlScale : undefined;
    return formatCellForTsv(rowNode.data[field], sqlScale);
}

/**
 * @param {any} api
 * @returns {string}
 */
function getFocusedColumnHeaderName(api) {
    if (!api || typeof api.getFocusedCell !== "function") return "";
    const focused = api.getFocusedCell();
    if (!focused || !focused.column) return "";
    const col = focused.column;
    const cd = typeof col.getColDef === "function" ? col.getColDef() : null;
    if (cd && cd.headerName != null && String(cd.headerName).trim() !== "") {
        return String(cd.headerName);
    }
    return typeof col.getColId === "function" ? String(col.getColId()) : "";
}

/**
 * Một dòng TSV: tên cột + tab + giá trị ô đang focus.
 * @param {any} api
 * @returns {string}
 */
function getFocusedCellWithHeaderTsv(api) {
    const header = getFocusedColumnHeaderName(api);
    const cell = getFocusedCellTextFromApi(api);
    if (!header && cell === "") return "";
    return header + "\t" + cell;
}

/** @param {any} api */
function fboGetDisplayedColIds(api) {
    if (!api || typeof api.getAllDisplayedColumns !== "function") return [];
    return api.getAllDisplayedColumns().map(function (c) {
        return typeof c.getColId === "function" ? c.getColId() : "";
    });
}

/** @param {any} params */
function fboCellSelKey(params) {
    if (!params || !params.column) return "";
    var colId = params.column.getColId();
    var node = params.node;
    if (node != null && node.id != null && node.id !== "") {
        return "n:" + String(node.id) + "\x1f" + colId;
    }
    return "r:" + String(params.rowIndex) + "\x1f" + colId;
}

/** @param {Set<string>} sel */
function fboColIdsFromCellSelection(sel) {
    var out = new Set();
    if (!sel) return out;
    sel.forEach(function (key) {
        var ix = key.indexOf("\x1f");
        if (ix >= 0) {
            out.add(key.slice(ix + 1));
        }
    });
    return out;
}

/**
 * @param {HTMLElement} gridHost
 * @param {any} cols
 * @param {string[]} columnFields
 */
function fboPickColsForReportFromSelection(gridHost, cols, columnFields) {
    var sel = gridHost.__fboCellSelection;
    if (!sel || sel.size === 0) return [];
    var idSet = fboColIdsFromCellSelection(sel);
    return columnFields
        .filter(function (n) {
            return idSet.has(n);
        })
        .map(function (n) {
            for (var i = 0; i < cols.length; i++) {
                if (cols[i] && cols[i].name === n) {
                    return cols[i];
                }
            }
            return null;
        })
        .filter(Boolean);
}

/**
 * Generate Header → Dir / Grid Input: gửi extension (Level DB key + hậu tố at/lk giống $f.$gi).
 * @param {"generateHeaderToDir"|"generateHeaderToGridInput"} command
 * @param {"normal"|"autocomplete"|"lookup"} fieldVariant
 * @param {HTMLElement} gridHost
 * @param {any} cols
 * @param {string[]} columnFields
 * @param {string} emptySelectionMessage
 */
function fboPostHeaderFieldGenerate(
    command,
    fieldVariant,
    gridHost,
    cols,
    columnFields,
    emptySelectionMessage
) {
    if (!cols || !cols.length) {
        window.vscode &&
            window.vscode.postMessage &&
            window.vscode.postMessage({
                command: "info",
                message: "Không có cột để tạo field XML.",
            });
        return;
    }
    const picked = fboPickColsForReportFromSelection(gridHost, cols, columnFields);
    if (!picked.length) {
        window.vscode &&
            window.vscode.postMessage &&
            window.vscode.postMessage({
                command: "info",
                message: emptySelectionMessage,
            });
        return;
    }
    window.vscode &&
        window.vscode.postMessage &&
        window.vscode.postMessage({
            command: command,
            columns: picked,
            fieldVariant: fieldVariant,
        });
}

/**
 * @param {HTMLElement} gridHost
 * @param {any} api
 * @returns {Array<{ rowIndex: number, colId: string, node: any }>}
 */
function fboEntriesFromCellSelection(gridHost, api) {
    var sel = gridHost.__fboCellSelection;
    if (!sel || sel.size === 0 || !api) return [];
    var idToRow = {};
    var rc = typeof api.getDisplayedRowCount === "function" ? api.getDisplayedRowCount() : 0;
    for (var r = 0; r < rc; r++) {
        var node = api.getDisplayedRowAtIndex(r);
        if (node && node.id != null && node.id !== "") {
            idToRow[String(node.id)] = r;
        }
    }
    var out = [];
    sel.forEach(function (key) {
        var ix = key.indexOf("\x1f");
        if (ix < 0) return;
        var prefix = key.slice(0, ix);
        var colId = key.slice(ix + 1);
        var rowIndex;
        if (prefix.indexOf("n:") === 0) {
            var nid = prefix.slice(2);
            if (idToRow[nid] === undefined) return;
            rowIndex = idToRow[nid];
        } else if (prefix.indexOf("r:") === 0) {
            rowIndex = parseInt(prefix.slice(2), 10);
            if (isNaN(rowIndex)) return;
        } else {
            return;
        }
        var node = api.getDisplayedRowAtIndex(rowIndex);
        if (!node) return;
        out.push({ rowIndex: rowIndex, colId: colId, node: node });
    });
    return out;
}

/**
 * Dòng 1: tên các cột có trong vùng chọn; các dòng sau: giá trị theo thứ tự hàng (TSV).
 * Không có selection hợp lệ → fallback một ô đang focus.
 * @param {HTMLElement} gridHost
 * @param {any} api
 * @param {string[]} columnFields
 * @param {Record<string, number>|undefined} scaleByField
 * @returns {string}
 */
function fboBuildCopySelectionWithHeaderTsv(gridHost, api, columnFields, scaleByField) {
    var entries = fboEntriesFromCellSelection(gridHost, api);
    if (entries.length === 0) {
        return getFocusedCellWithHeaderTsv(api);
    }
    var selectedCols = fboColIdsFromCellSelection(gridHost.__fboCellSelection);
    var colOrder = columnFields.filter(function (n) {
        return selectedCols.has(n);
    });
    if (colOrder.length === 0) {
        return getFocusedCellWithHeaderTsv(api);
    }
    var seenR = {};
    var rowIndices = [];
    entries.forEach(function (e) {
        if (!seenR[e.rowIndex]) {
            seenR[e.rowIndex] = true;
            rowIndices.push(e.rowIndex);
        }
    });
    rowIndices.sort(function (a, b) {
        return a - b;
    });
    var map = {};
    var scale = scaleByField || {};
    entries.forEach(function (e) {
        if (!e.node || !e.node.data) return;
        map[e.rowIndex + "\x1f" + e.colId] = formatCellForTsv(e.node.data[e.colId], scale[e.colId]);
    });
    var lines = [colOrder.join("\t")];
    rowIndices.forEach(function (r) {
        var cells = colOrder.map(function (c) {
            var v = map[r + "\x1f" + c];
            return v === undefined || v === null ? "" : v;
        });
        lines.push(cells.join("\t"));
    });
    return lines.join("\n");
}

/** @param {HTMLElement} gridHost @param {any} params */
function fboIsFullRowSelected(gridHost, params) {
    var sel = gridHost.__fboCellSelection;
    if (!sel || !params || !params.node) return false;
    var colIds = fboGetDisplayedColIds(params.api);
    var node = params.node;
    if (node.id != null && node.id !== "") {
        var p = "n:" + String(node.id) + "\x1f";
        return colIds.every(function (cid) {
            return sel.has(p + cid);
        });
    }
    var rp = "r:" + String(params.rowIndex) + "\x1f";
    return colIds.every(function (cid) {
        return sel.has(rp + cid);
    });
}

/** @param {HTMLElement} gridHost @param {any} params */
function fboSelectEntireDisplayedRow(gridHost, params) {
    var sel = gridHost.__fboCellSelection;
    sel.clear();
    var colIds = fboGetDisplayedColIds(params.api);
    var node = params.node;
    colIds.forEach(function (cid) {
        if (node != null && node.id != null && node.id !== "") {
            sel.add("n:" + String(node.id) + "\x1f" + cid);
        } else {
            sel.add("r:" + String(params.rowIndex) + "\x1f" + cid);
        }
    });
}

/** @param {HTMLElement} gridHost @param {any} params */
function fboCollapseRowSelectionToOneCell(gridHost, params) {
    var sel = gridHost.__fboCellSelection;
    sel.clear();
    sel.add(fboCellSelKey(params));
}

/** @param {HTMLElement} gridHost @param {any} api @param {any} a @param {any} b */
function fboSelectCellRange(gridHost, api, a, b) {
    var sel = gridHost.__fboCellSelection;
    sel.clear();
    var colIds = fboGetDisplayedColIds(api);
    var ia = colIds.indexOf(a.column.getColId());
    var ib = colIds.indexOf(b.column.getColId());
    if (ia < 0 || ib < 0) return;
    var cLo = Math.min(ia, ib);
    var cHi = Math.max(ia, ib);
    var rLo = Math.min(a.rowIndex, b.rowIndex);
    var rHi = Math.max(a.rowIndex, b.rowIndex);
    for (var r = rLo; r <= rHi; r++) {
        var node = api.getDisplayedRowAtIndex(r);
        if (!node) continue;
        for (var i = cLo; i <= cHi; i++) {
            var cid = colIds[i];
            if (node.id != null && node.id !== "") {
                sel.add("n:" + String(node.id) + "\x1f" + cid);
            } else {
                sel.add("r:" + String(r) + "\x1f" + cid);
            }
        }
    }
}

/**
 * @param {MouseEvent} event
 * @param {Array<
 *   | { type?: "item", label: string, onClick: () => void }
 *   | { type: "submenu", label: string, children: any[] }
 * >} items children của submenu có thể là item phẳng hoặc submenu lồng (Generate → Header To Dir → …)
 */
function showGridContextMenu(event, items) {
    const oldMenu = document.getElementById("fbo-grid-context-menu");
    if (oldMenu && oldMenu.parentNode) oldMenu.parentNode.removeChild(oldMenu);

    const menu = document.createElement("div");
    menu.id = "fbo-grid-context-menu";
    menu.className = "fbo-grid-context-menu-root";
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    function closeMenu() {
        if (menu.parentNode) menu.parentNode.removeChild(menu);
    }

    /**
     * @param {string} label
     * @param {() => void} onClick
     */
    function makeItemButton(label, onClick) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fbo-ctx-item";
        btn.textContent = label;
        btn.addEventListener("click", () => {
            onClick();
            closeMenu();
        });
        return btn;
    }

    /**
     * @param {HTMLElement} sub
     * @param {any[]} children
     */
    function appendSubmenuChildren(sub, children) {
        (children || []).forEach((ch) => {
            if (ch && ch.type === "submenu" && ch.children && ch.children.length) {
                const parent = document.createElement("div");
                parent.className = "fbo-ctx-submenu-parent";
                const trigger = document.createElement("button");
                trigger.type = "button";
                trigger.className = "fbo-ctx-item fbo-ctx-submenu-trigger";
                trigger.textContent = ch.label + " \u203A";
                const nested = document.createElement("div");
                nested.className = "fbo-ctx-submenu";
                appendSubmenuChildren(nested, ch.children);
                parent.appendChild(trigger);
                parent.appendChild(nested);
                sub.appendChild(parent);
            } else if (ch && ch.label && ch.onClick) {
                sub.appendChild(makeItemButton(ch.label, ch.onClick));
            }
        });
    }

    items.forEach((item) => {
        if (item.type === "submenu" && item.children && item.children.length) {
            const parent = document.createElement("div");
            parent.className = "fbo-ctx-submenu-parent";
            const trigger = document.createElement("button");
            trigger.type = "button";
            trigger.className = "fbo-ctx-item fbo-ctx-submenu-trigger";
            trigger.textContent = item.label + " \u203A";
            const sub = document.createElement("div");
            sub.className = "fbo-ctx-submenu";
            appendSubmenuChildren(sub, item.children);
            parent.appendChild(trigger);
            parent.appendChild(sub);
            menu.appendChild(parent);
        } else if (item.label && item.onClick) {
            menu.appendChild(makeItemButton(item.label, item.onClick));
        }
    });

    document.body.appendChild(menu);

    setTimeout(() => {
        const close = (ev) => {
            if (menu.parentNode && !menu.contains(ev.target)) {
                menu.parentNode.removeChild(menu);
            }
            document.removeEventListener("mousedown", close, true);
            document.removeEventListener("scroll", close, true);
            document.removeEventListener("keydown", close, true);
        };
        document.addEventListener("mousedown", close, true);
        document.addEventListener("scroll", close, true);
        document.addEventListener("keydown", close, true);
    }, 0);
}

/**
 * AG Grid Column dùng getPinned() (không phải isPinned).
 * @param {any} col
 * @returns {boolean}
 */
function columnPinnedLeftLegacy(col) {
    if (!col) return false;
    if (typeof col.getPinned === "function") {
        return col.getPinned() === "left";
    }
    if (typeof col.isPinned === "function") {
        return col.isPinned() === "left";
    }
    return false;
}

/**
 * @param {any} api
 * @param {string} colId
 * @returns {boolean}
 */
function columnPinnedLeftFromState(api, colId) {
    if (!api || !colId || typeof api.getColumnState !== "function") return false;
    const state = api.getColumnState();
    const s = state.find(function (x) {
        return x.colId === colId;
    });
    return !!(s && s.pinned === "left");
}

/**
 * @param {any} api
 * @param {any} column
 * @returns {boolean}
 */
function columnPinnedLeft(api, column) {
    const colId = column && typeof column.getColId === "function" ? column.getColId() : "";
    if (colId && columnPinnedLeftFromState(api, colId)) {
        return true;
    }
    return columnPinnedLeftLegacy(column);
}

/**
 * @param {any} api
 * @param {number} pinIndex
 * @returns {boolean}
 */
function isFrozenLeftExactlyThrough(api, pinIndex) {
    const cols = getGridColumnsInOrder(api);
    if (pinIndex < 0 || !cols || !cols.length) return false;
    if (typeof api.getColumnState !== "function") {
        for (let i = 0; i < cols.length; i++) {
            const left = columnPinnedLeftLegacy(cols[i]);
            if (i <= pinIndex) {
                if (!left) return false;
            } else if (left) {
                return false;
            }
        }
        return true;
    }
    const state = api.getColumnState();
    const map = {};
    for (let s = 0; s < state.length; s++) {
        map[state[s].colId] = state[s].pinned || null;
    }
    for (let i = 0; i < cols.length; i++) {
        const id = cols[i].getColId();
        const left = map[id] === "left";
        if (i <= pinIndex) {
            if (!left) return false;
        } else if (left) {
            return false;
        }
    }
    return true;
}

/**
 * Cập nhật mọi nút ghim trong grid (refreshHeader đôi khi không gọi lại header component).
 * @param {HTMLElement|null} gridRoot
 * @param {any} api
 */
function refreshAllFboPinButtonsInHost(gridRoot, api) {
    if (!gridRoot || !api) return;
    const wraps = gridRoot.querySelectorAll(".fbo-ag-header-with-pin[data-fbo-col-id]");
    for (let i = 0; i < wraps.length; i++) {
        const w = wraps[i];
        const btn = w.querySelector(".fbo-ag-pin-btn");
        const colId = w.getAttribute("data-fbo-col-id") || "";
        if (!btn || !colId) continue;
        const stub = { getColId: function () { return colId; } };
        syncFboPinButtonUi(btn, stub, api);
    }
}

/**
 * @param {any} api
 * @returns {any[]|null}
 */
function getGridColumnsInOrder(api) {
    if (!api) return null;
    let cols = null;
    if (typeof api.getColumns === "function") {
        cols = api.getColumns();
    }
    if ((!cols || !cols.length) && typeof api.getAllGridColumns === "function") {
        cols = api.getAllGridColumns();
    }
    if ((!cols || !cols.length) && typeof api.getAllDisplayedColumns === "function") {
        cols = api.getAllDisplayedColumns();
    }
    return cols && cols.length ? cols : null;
}

/**
 * Ghim trái mọi cột từ cột đầu đến cột được bấm (freeze như Excel).
 * Bấm lại đúng cột đang là ranh giới phải của vùng ghim thì bỏ ghim hết.
 * @param {any} api
 * @param {any} column
 * @param {HTMLElement|null} gridRoot phần tử .fbo-ag-grid-host để cập nhật nút ghim
 */
function applyPinColumnsFromLeftThrough(api, column, gridRoot) {
    if (!api || !column) return;
    const cols = getGridColumnsInOrder(api);
    if (!cols) return;
    const id = typeof column.getColId === "function" ? column.getColId() : "";
    let pinIndex = -1;
    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const cid = c && typeof c.getColId === "function" ? c.getColId() : "";
        if (cid === id) {
            pinIndex = i;
            break;
        }
    }
    if (pinIndex < 0) return;
    let state;
    if (isFrozenLeftExactlyThrough(api, pinIndex)) {
        state = cols.map((col) => ({
            colId: col.getColId(),
            pinned: null,
        }));
    } else {
        state = cols.map((col, idx) => ({
            colId: col.getColId(),
            pinned: idx <= pinIndex ? "left" : null,
        }));
    }
    try {
        if (typeof api.applyColumnState === "function") {
            api.applyColumnState({ state: state });
        }
        if (typeof api.refreshHeader === "function") {
            api.refreshHeader();
        }
        refreshAllFboPinButtonsInHost(gridRoot, api);
    } catch (e) {
        /* ignore */
    }
}

/**
 * Header cột: tên + (filter/menu mặc định AG Grid) + nút ghim.
 * @constructor
 */
function FboQueryResultHeader() {}

/**
 * @param {HTMLButtonElement} btn
 * @param {string} agIconClass ví dụ ag-icon-filter, ag-icon-menu-alt
 * @param {string} ariaLabel
 * @param {string} title
 * @param {(source: HTMLButtonElement) => void} onActivate
 */
function fboWireAgHeaderIconButton(btn, agIconClass, ariaLabel, title, onActivate) {
    btn.type = "button";
    btn.setAttribute("aria-label", ariaLabel);
    btn.title = title;
    const span = document.createElement("span");
    span.className = "ag-icon " + agIconClass;
    span.setAttribute("aria-hidden", "true");
    btn.appendChild(span);
    btn.addEventListener("mousedown", function (e) {
        e.stopPropagation();
    });
    btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        onActivate(btn);
    });
}

/**
 * @param {any} params IHeaderParams
 * @param {HTMLButtonElement|null} filterBtn
 */
function fboBindFilterActiveClass(params, filterBtn) {
    if (!filterBtn || !params || !params.column || !params.api) return;
    const col = params.column;
    const api = params.api;
    function sync() {
        const active = typeof col.isFilterActive === "function" && col.isFilterActive();
        filterBtn.classList.toggle("ag-filter-active", !!active);
    }
    sync();
    if (typeof api.addEventListener === "function") {
        api.addEventListener("filterChanged", sync);
    }
    return sync;
}

FboQueryResultHeader.prototype.init = function (params) {
    this.params = params;
    this._filterChangedSync = null;
    this._filterApi = null;
    const wrap = document.createElement("div");
    wrap.className = "fbo-ag-header-with-pin";
    if (params.column && typeof params.column.getColId === "function") {
        wrap.setAttribute("data-fbo-col-id", params.column.getColId());
    }
    const label = document.createElement("span");
    label.className = "fbo-ag-header-label";
    label.textContent = params.displayName != null ? String(params.displayName) : "";
    label.title = label.textContent;
    if (params.enableSorting !== false && typeof params.progressSort === "function") {
        label.classList.add("fbo-ag-header-label--sortable");
        label.addEventListener("click", function (e) {
            params.progressSort(e.shiftKey);
        });
    }
    const actions = document.createElement("div");
    actions.className = "fbo-ag-header-actions";

    if (params.enableFilterButton && typeof params.showFilter === "function") {
        const filterBtn = document.createElement("button");
        filterBtn.className = "fbo-ag-header-filter-btn ag-header-cell-filter-button";
        fboWireAgHeaderIconButton(
            filterBtn,
            "ag-icon-filter",
            "Bộ lọc cột",
            "Lọc",
            function (src) {
                params.showFilter(src);
            }
        );
        this.filterBtn = filterBtn;
        this._filterChangedSync = fboBindFilterActiveClass(params, filterBtn);
        this._filterApi = params.api;
        actions.appendChild(filterBtn);
    } else {
        this.filterBtn = null;
    }

    if (params.enableMenu && typeof params.showColumnMenu === "function") {
        const menuBtn = document.createElement("button");
        menuBtn.className = "fbo-ag-header-menu-btn ag-header-cell-menu-button";
        fboWireAgHeaderIconButton(
            menuBtn,
            "ag-icon-menu-alt",
            "Menu cột",
            "Menu cột (sắp xếp, cột, …)",
            function (src) {
                params.showColumnMenu(src);
            }
        );
        this.menuBtn = menuBtn;
        actions.appendChild(menuBtn);
    } else {
        this.menuBtn = null;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fbo-ag-pin-btn";
    btn.setAttribute("aria-label", "Ghim cột này và các cột bên trái");
    btn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/></svg>';
    this.pinBtn = btn;
    syncFboPinButtonUi(btn, params.column, params.api);
    btn.addEventListener("mousedown", function (e) {
        e.stopPropagation();
    });
    btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const gridRoot =
            (params.eGridDiv &&
                typeof params.eGridDiv.closest === "function" &&
                params.eGridDiv.closest(".fbo-ag-grid-host")) ||
            (wrap.closest && wrap.closest(".fbo-ag-grid-host"));
        applyPinColumnsFromLeftThrough(params.api, params.column, gridRoot || null);
    });
    actions.appendChild(btn);

    wrap.appendChild(label);
    wrap.appendChild(actions);
    this.eGui = wrap;
};

FboQueryResultHeader.prototype.getGui = function () {
    return this.eGui;
};

FboQueryResultHeader.prototype.refresh = function (params) {
    this.params = params;
    const label = this.eGui.querySelector(".fbo-ag-header-label");
    if (label) {
        label.textContent = params.displayName != null ? String(params.displayName) : "";
        label.title = label.textContent;
    }
    if (this.pinBtn) {
        syncFboPinButtonUi(this.pinBtn, params.column, params.api);
    }
    return true;
};

FboQueryResultHeader.prototype.destroy = function () {
    if (this._filterChangedSync && this._filterApi && typeof this._filterApi.removeEventListener === "function") {
        this._filterApi.removeEventListener("filterChanged", this._filterChangedSync);
    }
    this._filterChangedSync = null;
    this._filterApi = null;
};

/**
 * @param {HTMLButtonElement} btn
 * @param {any} column
 * @param {any} api
 */
function syncFboPinButtonUi(btn, column, api) {
    if (!btn) return;
    const left = columnPinnedLeft(api, column);
    btn.classList.toggle("fbo-ag-pin-btn--active", left);
    btn.setAttribute("aria-pressed", left ? "true" : "false");
    if (!left) {
        btn.title = "Ghim từ cột này trở về trái (freeze)";
        return;
    }
    const cols = getGridColumnsInOrder(api);
    let myIdx = -1;
    const myId = column && typeof column.getColId === "function" ? column.getColId() : "";
    if (cols && myId) {
        for (let i = 0; i < cols.length; i++) {
            const cid = cols[i] && typeof cols[i].getColId === "function" ? cols[i].getColId() : "";
            if (cid === myId) {
                myIdx = i;
                break;
            }
        }
    }
    const map = {};
    if (api && typeof api.getColumnState === "function") {
        api.getColumnState().forEach(function (s) {
            map[s.colId] = s.pinned || null;
        });
    }
    let rightBoundary = -1;
    if (cols) {
        for (let i = 0; i < cols.length; i++) {
            const cid = cols[i] && typeof cols[i].getColId === "function" ? cols[i].getColId() : "";
            if (map[cid] === "left") {
                rightBoundary = i;
            } else if (rightBoundary >= 0) {
                break;
            }
        }
    }
    if (myIdx >= 0 && myIdx === rightBoundary) {
        btn.title = "Bấm lại để bỏ ghim";
    } else {
        btn.title = "Bấm để thu hẹp vùng ghim đến cột này";
    }
}

/** Chiều cao tối thiểu mỗi grid khi kéo (px). */
const FBO_AG_GRID_MIN_HEIGHT = 120;

/**
 * @param {HTMLElement|null} el
 * @returns {number}
 */
function getGridHostHeightPx(el) {
    if (!el) return 220;
    const inline = el.style && el.style.height;
    if (inline && String(inline).indexOf("px") !== -1) {
        const n = parseFloat(inline);
        if (!isNaN(n)) return n;
    }
    const h = window.getComputedStyle(el).height;
    const m = parseFloat(h);
    return !isNaN(m) ? m : 220;
}

/**
 * @param {HTMLElement|null} el
 * @param {number} px
 */
function setGridHostHeightPx(el, px) {
    if (!el) return;
    const v = Math.max(FBO_AG_GRID_MIN_HEIGHT, Math.round(px));
    el.style.height = v + "px";
}

/**
 * @param {any} apiA
 * @param {any} apiB
 */
function notifyGridsAfterResize(apiA, apiB) {
    window.dispatchEvent(new Event("resize"));
    [apiA, apiB].forEach((api) => {
        if (!api) return;
        try {
            if (typeof api.checkViewportSize === "function") api.checkViewportSize();
        } catch (e1) {
            /* ignore */
        }
        try {
            if (typeof api.resetRowHeights === "function") api.resetRowHeights();
        } catch (e2) {
            /* ignore */
        }
    });
}

/**
 * Thanh kéo giữa hai batch: đổi chiều cao hai grid, tổng không đổi.
 * @param {HTMLElement} topHost
 * @param {HTMLElement} bottomHost
 * @param {any} topApi
 * @param {any} bottomApi
 * @returns {HTMLDivElement}
 */
function createBatchResizer(topHost, bottomHost, topApi, bottomApi) {
    const handle = document.createElement("div");
    handle.className = "fbo-ag-resizer";
    handle.setAttribute("title", "Kéo để chia chiều cao hai bảng kết quả");
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-orientation", "horizontal");

    handle.addEventListener("mousedown", function (downEv) {
        downEv.preventDefault();
        downEv.stopPropagation();
        handle.classList.add("fbo-ag-resizer--dragging");
        const startY = downEv.clientY;
        const hTop = getGridHostHeightPx(topHost);
        const hBottom = getGridHostHeightPx(bottomHost);
        const total = hTop + hBottom;
        const MIN = FBO_AG_GRID_MIN_HEIGHT;

        function onMove(moveEv) {
            moveEv.preventDefault();
            const dy = moveEv.clientY - startY;
            let newTop = hTop + dy;
            let newBottom = total - newTop;
            if (newTop < MIN) {
                newTop = MIN;
                newBottom = total - newTop;
            }
            if (newBottom < MIN) {
                newBottom = MIN;
                newTop = total - newBottom;
            }
            setGridHostHeightPx(topHost, newTop);
            setGridHostHeightPx(bottomHost, newBottom);
            notifyGridsAfterResize(topApi, bottomApi);
        }

        function onUp() {
            handle.classList.remove("fbo-ag-resizer--dragging");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            notifyGridsAfterResize(topApi, bottomApi);
            window.dispatchEvent(new Event("resize"));
        }

        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    return handle;
}

/**
 * Khởi tạo tabs + messages + nhiều AG Grid xếp dọc.
 */
function initQueryResultsAgGrid() {
    if (!window.queryResults) {
        throw new Error("No query results data found");
    }
    const agLib = typeof agGrid !== "undefined" ? agGrid : null;
    if (!agLib || typeof agLib.createGrid !== "function") {
        throw new Error("agGrid.createGrid không có — kiểm tra script AG Grid đã load.");
    }

    const data = window.queryResults;
    const theme = data.theme === "dark" ? "ag-theme-balham-dark" : "ag-theme-balham";

    const tabManager = new TabManager(data);
    tabManager.init();
    tabManager.switchTab("results");

    renderMessages(data);
    updateStatusBar(data);

    if (data.hasError && typeof CONFIG !== "undefined" && CONFIG.messages && CONFIG.messages.autoSwitchOnError) {
        tabManager.switchTab("messages");
    }

    const tableContainer = document.getElementById("tableContainer");
    if (!tableContainer) return;

    tableContainer.innerHTML = "";
    window.__fboGridApis = [];
    ensureGridCopyShortcutBound();

    const resultSets = data.resultSets || [];

    if (resultSets.length === 0) {
        tableContainer.innerHTML =
            '<div class="empty-state" style="padding:24px;text-align:center;"><p>Không có result set (chỉ có messages / rows affected).</p></div>';
        return;
    }

    /** @type {{ section: HTMLElement, gridHost: HTMLElement, api: any }[]} */
    const agPanels = [];

    resultSets.forEach((rs, index) => {
        const section = document.createElement("div");
        section.className = "fbo-ag-section";

        const gridHost = document.createElement("div");
        gridHost.className = `${theme} fbo-ag-grid-host`;
        section.appendChild(gridHost);

        tableContainer.appendChild(section);

        const cols = rs.columns || [];
        /** @type {Record<string, number>} */
        const scaleByField = {};
        cols.forEach(function (c) {
            if (c && c.name != null && typeof c.scale === "number" && c.scale >= 0) {
                scaleByField[c.name] = c.scale;
            }
        });
        const colDefs = cols.map((c) => {
            const field = c.name;
            const sqlScale = typeof c.scale === "number" && c.scale >= 0 ? c.scale : undefined;
            return {
                field,
                headerName: field,
                width: 140,
                minWidth: 72,
                maxWidth: 560,
                fboSqlScale: sqlScale,
                valueFormatter: (p) => formatSqlCellDisplay(p.value, sqlScale),
            };
        });

        const rowData = rowsToObjects(cols, rs.rows || []);

        if (!colDefs.length) {
            gridHost.textContent = "(Không có cột — result set rỗng.)";
            gridHost.style.minHeight = "48px";
            gridHost.style.padding = "12px";
            agPanels.push({ section, gridHost, api: null });
            return;
        }

        const pageSize = 50;
        const legacyHeight = Math.min(520, Math.max(220, 72 + Math.min(rowData.length, 12) * 28));
        const compactHeight = 72 + Math.min(rowData.length, 12) * 28;
        // Giữ chiều cao cũ cho grid lớn, nhưng co lại khi ít dòng.
        const gridHeight = Math.min(legacyHeight, Math.max(118, compactHeight));

        gridHost.style.height = `${gridHeight}px`;
        gridHost.style.width = "100%";
        gridHost.tabIndex = 0;

        const columnFields = cols.map((c) => (c && c.name) || "").filter(Boolean);

        gridHost.__fboCellSelection = new Set();
        gridHost.__fboSelectionAnchor = null;

        const api = agLib.createGrid(gridHost, {
            columnDefs: colDefs,
            rowData,
            context: { fboSelectionGridHost: gridHost },
            headerHeight: 52,
            defaultColDef: {
                sortable: true,
                resizable: true,
                filter: true,
                headerComponent: FboQueryResultHeader,
                cellClassRules: {
                    "fbo-cell-selected": function (p) {
                        var h = p.context && p.context.fboSelectionGridHost;
                        if (!h || !h.__fboCellSelection) {
                            return false;
                        }
                        return h.__fboCellSelection.has(fboCellSelKey(p));
                    },
                },
            },
            rowSelection: "multiple",
            suppressRowClickSelection: true,
            animateRows: true,
            pagination: rowData.length > pageSize,
            paginationPageSize: pageSize,
            paginationPageSizeSelector: [50, 100, 200, 500],
            suppressCellFocus: false,
            enableCellTextSelection: false,
            suppressClipboardPaste: true,
            suppressCutToClipboard: true,
            ensureDomOrder: true,
            alwaysShowHorizontalScroll: true,
            onCellClicked: (params) => {
                if (params && params.column && params.rowIndex != null) {
                    params.api.setFocusedCell(params.rowIndex, params.column);
                    const allCols =
                        typeof params.api.getAllDisplayedColumns === "function"
                            ? params.api.getAllDisplayedColumns()
                            : params.columnApi && params.columnApi.getAllDisplayedColumns
                              ? params.columnApi.getAllDisplayedColumns()
                              : [];
                    const colIndex = allCols.indexOf(params.column);
                    updateColumnIndexStatus(colIndex >= 0 ? colIndex + 1 : 0);
                }
                scrollResultSectionIntoView(gridHost);
                if (!params || !params.column || params.rowIndex == null) {
                    return;
                }
                const ev = params.event;
                const meta = !!(ev && (ev.ctrlKey || ev.metaKey));
                const shift = !!(ev && ev.shiftKey);

                if (meta) {
                    const k = fboCellSelKey(params);
                    if (gridHost.__fboCellSelection.has(k)) {
                        gridHost.__fboCellSelection.delete(k);
                    } else {
                        gridHost.__fboCellSelection.add(k);
                    }
                    gridHost.__fboSelectionAnchor = {
                        rowIndex: params.rowIndex,
                        colId: params.column.getColId(),
                        node: params.node,
                    };
                    params.api.refreshCells({ force: true });
                    return;
                }
                if (shift && gridHost.__fboSelectionAnchor) {
                    const ac = gridHost.__fboSelectionAnchor;
                    const colA =
                        params.api && typeof params.api.getColumn === "function"
                            ? params.api.getColumn(ac.colId)
                            : params.columnApi && typeof params.columnApi.getColumn === "function"
                              ? params.columnApi.getColumn(ac.colId)
                              : null;
                    if (colA) {
                        const anchorParams = {
                            rowIndex: ac.rowIndex,
                            column: colA,
                            node: ac.node,
                        };
                        fboSelectCellRange(gridHost, params.api, anchorParams, params);
                    }
                    params.api.refreshCells({ force: true });
                    return;
                }
                /* Click thường: cập nhật selection ngay (không debounce — tránh ô cũ còn tô sáng ~280ms) */
                gridHost.__fboCellSelection.clear();
                gridHost.__fboCellSelection.add(fboCellSelKey(params));
                gridHost.__fboSelectionAnchor = {
                    rowIndex: params.rowIndex,
                    colId: params.column.getColId(),
                    node: params.node,
                };
                params.api.refreshCells({ force: true });
            },
            onCellDoubleClicked: (params) => {
                if (!params || !params.column || params.rowIndex == null) {
                    return;
                }
                params.api.setFocusedCell(params.rowIndex, params.column);
                if (fboIsFullRowSelected(gridHost, params)) {
                    fboCollapseRowSelectionToOneCell(gridHost, params);
                } else {
                    fboSelectEntireDisplayedRow(gridHost, params);
                }
                gridHost.__fboSelectionAnchor = {
                    rowIndex: params.rowIndex,
                    colId: params.column.getColId(),
                    node: params.node,
                };
                params.api.refreshCells({ force: true });
                scrollResultSectionIntoView(gridHost);
            },
            onCellFocused: (params) => {
                if (!params || !params.column || params.rowIndex == null || params.rowIndex < 0) return;
                const allCols = params.columnApi && params.columnApi.getAllDisplayedColumns
                    ? params.columnApi.getAllDisplayedColumns()
                    : [];
                const colIndex = allCols.indexOf(params.column);
                updateColumnIndexStatus(colIndex >= 0 ? colIndex + 1 : 0);
            },
            onFirstDataRendered: (params) => {
                fboAutoSizeColumnsByContent(params.api, params.columnApi);
            },
            onGridSizeChanged: (params) => {
                fboAutoSizeColumnsByContent(params.api, params.columnApi);
            },
            onCellContextMenu: (params) => {
                if (params && params.column) {
                    params.api.setFocusedCell(params.rowIndex, params.column);
                }
                if (
                    params &&
                    params.column &&
                    params.rowIndex != null &&
                    gridHost.__fboCellSelection &&
                    gridHost.__fboCellSelection.size === 0
                ) {
                    gridHost.__fboCellSelection.add(fboCellSelKey(params));
                    gridHost.__fboSelectionAnchor = {
                        rowIndex: params.rowIndex,
                        colId: params.column.getColId(),
                        node: params.node,
                    };
                    params.api.refreshCells({ force: true });
                }
                scrollResultSectionIntoView(gridHost);
                if (params && params.event && typeof params.event.preventDefault === "function") {
                    params.event.preventDefault();
                }
                const row = getTargetRowData(api);
                const line = rowToTsv(columnFields, row, scaleByField);
                const headerLine = columnFields.join("\t");
                const copyCell = getFocusedCellTextFromApi(api);
                const copyCellWithHeader = fboBuildCopySelectionWithHeaderTsv(
                    gridHost,
                    api,
                    columnFields,
                    scaleByField
                );
                showGridContextMenu(params.event, [
                    {
                        type: "submenu",
                        label: "Copy",
                        children: [
                            {
                                label: "Copy",
                                onClick: () => {
                                    if (!copyCell) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Không có ô nào được focus để copy.",
                                            });
                                        return;
                                    }
                                    postCopy(copyCell, "Đã copy ô hiện tại");
                                },
                            },
                            {
                                label: "Copy with header",
                                onClick: () => {
                                    if (!copyCellWithHeader) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Không có dữ liệu để copy (chọn ô hoặc focus một ô).",
                                            });
                                        return;
                                    }
                                    postCopy(
                                        copyCellWithHeader,
                                        "Đã copy vùng chọn + header cột (TSV)"
                                    );
                                },
                            },
                            {
                                label: "Copy header",
                                onClick: () => {
                                    postCopy(headerLine, "Đã copy header (TSV)");
                                },
                            },
                            {
                                label: "Copy row",
                                onClick: () => {
                                    if (!row) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Chọn một dòng: click vào một ô trong grid rồi bấm chuột phải.",
                                            });
                                        return;
                                    }
                                    postCopy(line, "Đã copy row (TSV)");
                                },
                            },
                            {
                                label: "Copy row with header",
                                onClick: () => {
                                    if (!row) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Chọn một dòng: click vào một ô trong grid rồi bấm chuột phải.",
                                            });
                                        return;
                                    }
                                    postCopy(headerLine + "\n" + line, "Đã copy row + header (TSV)");
                                },
                            },
                        ],
                    },
                    {
                        type: "submenu",
                        label: "Generate",
                        children: [
                            {
                                label: "Header To Pivot Excel",
                                onClick: () => {
                                    if (!columnFields || !columnFields.length) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Không có cột để tạo header.",
                                            });
                                        return;
                                    }
                                    if (typeof FboPivotExcelHeaderGenerator !== "function") {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Thiếu FboPivotExcelHeaderGenerator (GenerateProcessing.js).",
                                            });
                                        return;
                                    }
                                    const gen = new FboPivotExcelHeaderGenerator(columnFields, {
                                        pivotPrefix: "!2.",
                                    });
                                    postCopy(
                                        gen.buildTwoRowTsv(),
                                        "Đã copy 2 hàng header Pivot Excel (TSV)"
                                    );
                                },
                            },
                            {
                                label: "Header To Grid Report",
                                onClick: () => {
                                    if (!cols || !cols.length) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Không có cột để tạo field XML.",
                                            });
                                        return;
                                    }
                                    if (typeof FboGridReportHeaderGenerator !== "function") {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Thiếu FboGridReportHeaderGenerator (GenerateHeaderToReport.js).",
                                            });
                                        return;
                                    }
                                    const pickedCols = fboPickColsForReportFromSelection(
                                        gridHost,
                                        cols,
                                        columnFields
                                    );
                                    if (!pickedCols.length) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message:
                                                    "Chọn ít nhất một ô (click, Ctrl+click nhiều ô, Shift+vùng, double-click chọn cả hàng). Header To Grid Report chỉ lấy cột của các ô đang chọn.",
                                            });
                                        return;
                                    }
                                    const genReport = new FboGridReportHeaderGenerator(pickedCols, {
                                        defaultWidth: 100,
                                    });
                                    const xml = genReport.buildAllFieldsXml();
                                    if (!xml) {
                                        window.vscode &&
                                            window.vscode.postMessage &&
                                            window.vscode.postMessage({
                                                command: "info",
                                                message: "Không có tên cột hợp lệ để sinh XML.",
                                            });
                                        return;
                                    }
                                    postCopy(xml, "Đã copy XML field (Grid report)");
                                },
                            },
                            {
                                type: "submenu",
                                label: "Header To Dir",
                                children: [
                                    {
                                        label: "Normal",
                                        onClick: () => {
                                            fboPostHeaderFieldGenerate(
                                                "generateHeaderToDir",
                                                "normal",
                                                gridHost,
                                                cols,
                                                columnFields,
                                                "Chọn ít nhất một ô (click, Ctrl+click, Shift+vùng, double-click hàng). Header To Dir chỉ lấy cột của các ô đang chọn."
                                            );
                                        },
                                    },
                                    {
                                        label: "Autocomplete",
                                        onClick: () => {
                                            fboPostHeaderFieldGenerate(
                                                "generateHeaderToDir",
                                                "autocomplete",
                                                gridHost,
                                                cols,
                                                columnFields,
                                                "Chọn ít nhất một ô (click, Ctrl+click, Shift+vùng, double-click hàng). Header To Dir chỉ lấy cột của các ô đang chọn."
                                            );
                                        },
                                    },
                                    {
                                        label: "Lookup",
                                        onClick: () => {
                                            fboPostHeaderFieldGenerate(
                                                "generateHeaderToDir",
                                                "lookup",
                                                gridHost,
                                                cols,
                                                columnFields,
                                                "Chọn ít nhất một ô (click, Ctrl+click, Shift+vùng, double-click hàng). Header To Dir chỉ lấy cột của các ô đang chọn."
                                            );
                                        },
                                    },
                                ],
                            },
                            {
                                type: "submenu",
                                label: "Header To Grid Input",
                                children: [
                                    {
                                        label: "Normal",
                                        onClick: () => {
                                            fboPostHeaderFieldGenerate(
                                                "generateHeaderToGridInput",
                                                "normal",
                                                gridHost,
                                                cols,
                                                columnFields,
                                                "Chọn ít nhất một ô (click, Ctrl+click, Shift+vùng, double-click hàng). Header To Grid Input chỉ lấy cột của các ô đang chọn."
                                            );
                                        },
                                    },
                                    {
                                        label: "Autocomplete",
                                        onClick: () => {
                                            fboPostHeaderFieldGenerate(
                                                "generateHeaderToGridInput",
                                                "autocomplete",
                                                gridHost,
                                                cols,
                                                columnFields,
                                                "Chọn ít nhất một ô (click, Ctrl+click, Shift+vùng, double-click hàng). Header To Grid Input chỉ lấy cột của các ô đang chọn."
                                            );
                                        },
                                    },
                                    {
                                        label: "Lookup",
                                        onClick: () => {
                                            fboPostHeaderFieldGenerate(
                                                "generateHeaderToGridInput",
                                                "lookup",
                                                gridHost,
                                                cols,
                                                columnFields,
                                                "Chọn ít nhất một ô (click, Ctrl+click, Shift+vùng, double-click hàng). Header To Grid Input chỉ lấy cột của các ô đang chọn."
                                            );
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                ]);
            },
        });

        gridHost.__fboAgApi = api;
        window.__fboGridApis.push(api);

        gridHost.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
        });

        agPanels.push({ section, gridHost, api });
    });

    for (let i = 0; i < agPanels.length - 1; i++) {
        const resizer = createBatchResizer(
            agPanels[i].gridHost,
            agPanels[i + 1].gridHost,
            agPanels[i].api,
            agPanels[i + 1].api
        );
        tableContainer.insertBefore(resizer, agPanels[i + 1].section);
    }
}
