const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");
const { resolveBundledDatabaseRoot } = require("../extensionDatabasePaths");

class ConvertGridToPivotExcel {
    async run() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage("Không có file đang mở.");
            return;
        }

        const document = editor.document;
        if (document.languageId !== "xml") {
            vscode.window.showErrorMessage("Chức năng này chỉ dùng cho file XML Grid.");
            return;
        }

        const activePath = (document.uri && document.uri.fsPath) || "";
        if (!/\\Grid\\|\/Grid\//i.test(activePath)) {
            vscode.window.showErrorMessage("FBO: Convert Grid To Pivot Excel chỉ áp dụng cho file trong thư mục Grid.");
            return;
        }

        const xml = document.getText();
        const defaults = this._buildDefaults(xml);

        const rowInput = await this._promptInput(
            "Row fields (csv)",
            "rowField + systotal + các field trong <view id=\"Grid\">",
            defaults.rowCsv
        );
        if (!rowInput) {
            return;
        }

        const colInput = await this._promptInput(
            "Column fields (csv)",
            "Ví dụ: xpivot,npivot",
            defaults.columnCsv
        );
        if (!colInput) {
            return;
        }

        const valueInput = await this._promptInput(
            "Value fields (csv)",
            "Ví dụ: thuc_hien,thuc_hien_nt",
            defaults.valueCsv
        );
        if (!valueInput) {
            return;
        }

        const documentUri = document.uri;
        const currentFileName = path.basename(documentUri.fsPath, path.extname(documentUri.fsPath));
        const defaultUri = vscode.Uri.joinPath(documentUri, '..', `${currentFileName}.xlsx`);

        // Copy template folder path to clipboard
        const controllersFolder = path.dirname(path.dirname(documentUri.fsPath));
        const targetFolder = path.join(controllersFolder, 'Templates', 'Excel');
        await vscode.env.clipboard.writeText(targetFolder);
        vscode.window.showInformationMessage(`Đã copy đường dẫn Templates\\Excel vào clipboard để bạn dễ dàng Paste.`);

        const saveUri = await vscode.window.showSaveDialog({
            title: "Chọn vị trí lưu Pivot Excel",
            filters: { "Excel Files": ["xlsx"] },
            defaultUri: defaultUri,
            saveLabel: "Xuất Pivot Excel",
        });
        if (!saveUri) {
            vscode.window.showWarningMessage("Đã hủy xuất Pivot Excel.");
            return;
        }

        const exePath = this._resolvePivotExePath();
        if (!exePath || !fs.existsSync(exePath)) {
            vscode.window.showErrorMessage(
                "Không tìm thấy PivotExcel.exe. Vui lòng kiểm tra thư mục src/Database/PivotExcelExe."
            );
            return;
        }

        const args = [rowInput, colInput, valueInput, saveUri.fsPath];
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: "FBO: Convert Grid To Pivot Excel",
                cancellable: false,
            },
            async () => {
                await this._runExe(exePath, args);
            }
        );

        vscode.window.showInformationMessage(`Đã xuất file: ${saveUri.fsPath}`);
    }

    _resolvePivotExePath() {
        const dbRoot = resolveBundledDatabaseRoot();
        return path.join(dbRoot, "PivotExcelExe", "PivotExcel.exe");
    }

    _runExe(exePath, args) {
        return new Promise((resolve, reject) => {
            execFile(exePath, args, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    const msg = [error.message, stdout, stderr].filter(Boolean).join("\n");
                    return reject(new Error(msg));
                }
                resolve();
            });
        }).catch((err) => {
            vscode.window.showErrorMessage("Convert Grid To Pivot Excel lỗi: " + err.message);
            throw err;
        });
    }

    async _promptInput(title, placeHolder, value) {
        const input = await vscode.window.showInputBox({
            title,
            placeHolder,
            value: value || "",
            ignoreFocusOut: true,
            validateInput: (v) => {
                return String(v || "").trim() ? null : "Không được để trống";
            },
        });
        if (typeof input === "undefined") {
            return null;
        }
        return input.trim();
    }

    _buildDefaults(xml) {
        const attrs = this._extractGridAttrs(xml);
        const dataFields = this._splitCsv(attrs.dataFields);

        // Input 1: rowField + systotal + tất cả field trong <view id="Grid">...</view>
        const rowCandidates = [];
        if (attrs.rowField) {
            rowCandidates.push(attrs.rowField);
            rowCandidates.push("systotal");
        }
        for (const name of this._extractGridViewFieldNames(xml)) {
            rowCandidates.push(this._gridViewFieldToRowToken(name));
        }

        const rowDefaults = this._unique(
            rowCandidates.filter((x) => !this._isFieldInDataFields(x, dataFields))
        );

        const colDefaults = this._unique(
            [attrs.columnField, "npivot"].filter(Boolean)
        );

        const valueDefaults = this._unique(dataFields);

        return {
            rowCsv: rowDefaults.join(","),
            columnCsv: colDefaults.join(","),
            valueCsv: valueDefaults.join(","),
        };
    }

    _extractGridAttrs(xml) {
        const pivotTag = (xml.match(/<pivot\b[^>]*\/?>/i) || [])[0] || "";
        const gridTag = (xml.match(/<grid\b[^>]*>/i) || [])[0] || "";
        const viewGridTag = (xml.match(/<view\b[^>]*\bid\s*=\s*["']Grid["'][^>]*>/i) || [])[0] || "";
        return {
            rowField:
                this._extractAttr(pivotTag, "rowField") ||
                this._extractAttr(gridTag, "rowField") ||
                this._extractAttr(viewGridTag, "rowField"),
            columnField:
                this._extractAttr(pivotTag, "columnField") ||
                this._extractAttr(gridTag, "columnField") ||
                this._extractAttr(viewGridTag, "columnField"),
            dataFields:
                this._extractAttr(pivotTag, "dataFields") ||
                this._extractAttr(gridTag, "dataFields") ||
                this._extractAttr(viewGridTag, "dataFields"),
        };
    }

    _extractAttr(tag, attrName) {
        const re = new RegExp(attrName + "\\s*=\\s*\"([^\"]*)\"", "i");
        const m = tag.match(re);
        return m ? String(m[1]).trim() : "";
    }

    /**
     * Lấy danh sách name từ các thẻ <field .../> bên trong <view id="Grid">...</view>.
     */
    _extractGridViewFieldNames(xml) {
        const startRe = /<view\b[^>]*\bid\s*=\s*["']Grid["'][^>]*>/i;
        const startMatch = xml.match(startRe);
        if (!startMatch || typeof startMatch.index !== "number") {
            return [];
        }
        const startIdx = startMatch.index + startMatch[0].length;
        const afterStart = xml.slice(startIdx);
        const endMatch = afterStart.match(/<\/view>/i);
        if (!endMatch || typeof endMatch.index !== "number") {
            return [];
        }
        const inner = afterStart.slice(0, endMatch.index);
        const names = [];
        const fieldRe = /<field\b[^>]*\bname\s*=\s*"([^"]*)"/gi;
        let m;
        while ((m = fieldRe.exec(inner)) !== null) {
            const n = String(m[1]).trim();
            if (n) {
                names.push(n);
            }
        }
        return names;
    }

    /**
     * Field trong <view id="Grid"> → dùng trong row input với prefix ?h_ (vd chi_tieu → ?h_chi_tieu).
     */
    _gridViewFieldToRowToken(name) {
        const n = String(name || "").trim();
        if (!n) {
            return n;
        }
        if (/^\?h_/i.test(n)) {
            return n;
        }
        return "?h_" + n;
    }

    /**
     * Loại khỏi row nếu token hoặc tên gốc (bỏ ?h_) nằm trong dataFields.
     */
    _isFieldInDataFields(token, dataFields) {
        const t = String(token || "").trim();
        if (!t) {
            return true;
        }
        const base = t.replace(/^\?h_/i, "");
        return dataFields.some((d) => {
            const x = String(d || "").trim().toLowerCase();
            return x === t.toLowerCase() || x === base.toLowerCase();
        });
    }

    _splitCsv(value) {
        if (!value) {
            return [];
        }
        return String(value)
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
    }

    _unique(arr) {
        const seen = Object.create(null);
        const out = [];
        for (const item of arr) {
            const k = String(item).toLowerCase();
            if (!seen[k]) {
                seen[k] = true;
                out.push(item);
            }
        }
        return out;
    }
}

module.exports = ConvertGridToPivotExcel;
