const fs = require('fs');
const path = require('path');

/**
 * =============================================================================
 * FboEntParser.js — Bộ phân tích file .ent của FastBusiness
 * =============================================================================
 *
 * FastBusiness dùng file .ent như các câu lệnh IF-ELSE lồng nhau:
 *
 *   Câu trúc tổng quát của 1 file .ent:
 *   ─────────────────────────────────────
 *   <!ENTITY % Conditional.ABC "INCLUDE">     ← Khai báo điều kiện (có thể là SYSTEM file)
 *   <!ENTITY % Conditional.XYZ SYSTEM "...">  ← Điều kiện lấy từ file ngoài
 *
 *   <![%Conditional.ABC;[                     ← IF (ABC = INCLUDE)
 *     <!ENTITY % SubCondition "INCLUDE">      ←   Điều kiện con (lồng IF-ELSE tiếp)
 *     <![%SubCondition;[                      ←   IF lồng
 *       <!ENTITY RealEntity "value">          ←     Entity thật
 *     ]]>                                     ←   End IF lồng
 *     <!ENTITY FallbackForSub "">             ←   ELSE cho SubCondition (nếu SubCondition=IGNORE)
 *   ]]>                                       ← End IF (ABC)
 *
 *   <!ENTITY FallbackForABC "">              ← ELSE cho ABC (nếu ABC=IGNORE)
 *
 *   QUY TẮC CỐT LÕI:
 *   - INCLUDE  → CHỈ đọc bên trong khối. Mọi entity bên ngoài là VÔ HÌNH (bất kể rỗng hay không).
 *   - IGNORE   → Bỏ qua bên trong khối. Đọc phần ELSE (entity bên ngoài) bình thường.
 *   - "Bên ngoài vô hình" = tất cả entity declaration nằm giữa ]]> và <![...[ tiếp theo.
 * =============================================================================
 */

class FboEntParser {
    /**
     * @param {Function} readFileFn          - function(filePath): string — đọc file và trả về nội dung
     * @param {Function} resolvePathFn       - function(currentFile, relativeUrl): string — resolve path tương đối
     * @param {Function} recordFileMtimeFn   - function(filePath): void — (tùy chọn) ghi nhận mtime của file
     */
    constructor(readFileFn, resolvePathFn, recordFileMtimeFn) {
        this._readFile = readFileFn;
        this._resolvePath = resolvePathFn;
        this._recordFileMtime = recordFileMtimeFn;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Phân tích nội dung DTD (hoặc file .ent) trực tiếp từ chuỗi (string).
     * @returns {{ paramEntities: Object, generalEntities: Object, overriddenEntities: Array }}
     */
    parseContent(content, currentFilePath, lineOffset = 0, seedParams = {}, seedGeneral = {}, seedOverridden = []) {
        const paramEntities = { ...seedParams };
        const generalEntities = { ...seedGeneral };
        const overriddenEntities = [...seedOverridden];

        this._parseBlock(content, currentFilePath, lineOffset, paramEntities, generalEntities, overriddenEntities, false);

        return { paramEntities, generalEntities, overriddenEntities };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL: Helper tìm dòng
    // ─────────────────────────────────────────────────────────────────────────

    _buildLineIndex(content) {
        const lineIndex = [0];
        let i = -1;
        while ((i = content.indexOf('\n', i + 1)) !== -1) {
            lineIndex.push(i + 1);
        }
        return lineIndex;
    }

    _getLineNumber(lineIndex, charIndex) {
        let low = 0;
        let high = lineIndex.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (lineIndex[mid] <= charIndex) {
                if (mid === lineIndex.length - 1 || lineIndex[mid + 1] > charIndex) {
                    return mid + 1;
                }
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INTERNAL: Parse một đoạn nội dung DTD
    // ─────────────────────────────────────────────────────────────────────────

    _parseBlock(content, currentFilePath, lineOffset, paramEntities, generalEntities, overriddenEntities, insideIncludeBlock) {
        const lineIndex = this._buildLineIndex(content);
        let i = 0;

        while (i < content.length) {
            const ch = content[i];

            // ── 0. Skip comment <!-- ... -->
            if (ch === '<' && content[i+1] === '!' && content[i+2] === '-' && content[i+3] === '-') {
                const end = content.indexOf('-->', i + 4);
                i = (end !== -1) ? end + 3 : content.length;
                continue;
            }

            // ── 1. Khai báo <!ENTITY ...>
            if (ch === '<' && content.startsWith('<!ENTITY', i)) {
                const end = this._findEntityEnd(content, i);
                const decl = content.substring(i, end + 1);
                const lineNumber = this._getLineNumber(lineIndex, i) + lineOffset;

                this._processEntityDecl(
                    decl, currentFilePath, lineNumber,
                    paramEntities, generalEntities, overriddenEntities
                );

                i = end + 1;
                continue;
            }

            // ── 2. Khối điều kiện <![%Condition;[ ... ]]>
            if (ch === '<' && content.startsWith('<![', i)) {
                const { end, section } = this._extractConditionalSection(content, i);
                
                const matchCond = section.match(/^<!\[\s*([^\[]+)\[/);
                const prefixLines = matchCond ? matchCond[0].split('\n').length - 1 : 0;
                const parentLinesBefore = this._getLineNumber(lineIndex, i) - 1;
                const innerLineOffset = lineOffset + parentLinesBefore + prefixLines;

                this._processConditionalSection(
                    section, currentFilePath, innerLineOffset,
                    paramEntities, generalEntities, overriddenEntities
                );

                i = end + 3; // Bước qua ]]>
                continue;
            }

            // ── 3. Tham chiếu % entity tự do: %Name;
            if (ch === '%' && /\w/.test(content[i+1] || '')) {
                const match = content.slice(i).match(/^%([\w.]+);/);
                if (match) {
                    const name = match[1];
                    if (paramEntities[name]) {
                        const ent = paramEntities[name];
                        const parentLinesBefore = this._getLineNumber(lineIndex, i) - 1;
                        const innerLineOffset = ent.systemUrl ? 0 : (lineOffset + parentLinesBefore);
                        
                        if (ent.systemUrl && !ent._parsed) {
                            ent._parsed = true;
                            const extContent = this._safeRead(ent.resolvedPath);
                            if (extContent !== null) {
                                this._parseBlock(extContent, ent.resolvedPath, 0, paramEntities, generalEntities, overriddenEntities, false);
                            }
                        } else if (!ent.systemUrl && ent.value) {
                            this._parseBlock(ent.value, ent.sourceFile || currentFilePath, innerLineOffset, paramEntities, generalEntities, overriddenEntities, false);
                        }
                    }
                    i += match[0].length;
                    continue;
                }
            }

            i++;
        }
    }

    _processEntityDecl(decl, currentFilePath, lineNumber, paramEntities, generalEntities, overriddenEntities) {

        // ── TRƯỜNG HỢP 1: <!ENTITY % Name SYSTEM "path">
        // Dùng lazy load: KHÔNG tự động parse ngay khi khai báo.
        // Chỉ lưu thông tin, chờ %name; được gọi thực sự mới parse.
        // Lý do: Nếu auto-parse ngay, các file .Include.XTran trong InputInvoice.ent
        // sẽ được đọc theo thứ tự khai báo (PATran trước CPTran), khiến entity IICheck
        // của PATran chiếm slot trước, bỏ qua IICheck của CPTran khi parse sau.
        let m = decl.match(/^<!ENTITY\s+%\s+([\w.]+)\s+SYSTEM\s+(["'])([^"'\r\n]+)\2\s*>/i);
        if (m) {
            const name = m[1];
            const systemUrl = m[3];
            const resolvedPath = this._resolvePath(currentFilePath, systemUrl);
            
            if (!paramEntities[name]) {
                paramEntities[name] = {
                    value: null,      // Chưa đọc nội dung
                    systemUrl,
                    sourceFile: resolvedPath,
                    resolvedPath,
                    line: 1,
                    text: decl,
                    _parsed: false    // Chưa parse — sẽ parse khi %name; được gọi
                };
            } else {
                overriddenEntities.push({
                    name, systemUrl, sourceFile: resolvedPath, line: lineNumber, text: decl, is_parameter: true, declaredInFile: currentFilePath
                });
            }
            return;
        }

        // ── TRƯỜNG HỢP 2: <!ENTITY % Name "value">
        m = decl.match(/^<!ENTITY\s+%\s+([\w.]+)\s+(["'])([\s\S]*?)\2\s*>/i);
        if (m) {
            const name = m[1];
            if (!paramEntities[name]) {
                paramEntities[name] = {
                    value: m[3],
                    systemUrl: null,
                    sourceFile: currentFilePath,
                    resolvedPath: null,
                    line: lineNumber,
                    text: decl
                };
            }
            return;
        }

        // ── TRƯỜNG HỢP 3: <!ENTITY Name SYSTEM "path">
        m = decl.match(/^<!ENTITY\s+([\w.]+)\s+SYSTEM\s+(["'])([^"'\r\n]+)\2\s*>/i);
        if (m) {
            const name = m[1];
            const systemUrl = m[3];
            const resolvedPath = this._resolvePath(currentFilePath, systemUrl);

            if (!generalEntities[name]) {
                if (this._recordFileMtime) {
                    this._recordFileMtime(resolvedPath);
                }
                generalEntities[name] = {
                    name,
                    value: null,
                    systemUrl,
                    sourceFile: resolvedPath,
                    line: 1, // External files start at 1
                    declaredInFile: currentFilePath,
                    text: decl
                };
            } else {
                overriddenEntities.push({
                    name, 
                    previousValue: generalEntities[name], 
                    overridingFile: resolvedPath,
                    overridingLine: lineNumber
                });
            }
            return;
        }

        // ── TRƯỜNG HỢP 4: <!ENTITY Name "value">
        m = decl.match(/^<!ENTITY\s+([\w.]+)\s+(["'])([\s\S]*?)\2\s*>/i);
        if (m) {
            const name = m[1];
            if (!generalEntities[name]) {
                generalEntities[name] = {
                    name,
                    value: m[3],
                    systemUrl: null,
                    sourceFile: currentFilePath,
                    line: lineNumber,
                    declaredInFile: currentFilePath,
                    text: decl
                };
            }
        }
    }

    _processConditionalSection(section, currentFilePath, innerLineOffset, paramEntities, generalEntities, overriddenEntities) {
        const headMatch = section.match(/^<!\[\s*(.+?)\s*\[/);
        if (!headMatch) return null;

        const innerContent = section.slice(headMatch[0].length, section.length - 3);

        const resolvedCondition = this._resolveCondition(headMatch[1].trim(), paramEntities);

        if (resolvedCondition === 'INCLUDE') {
            this._parseBlock(innerContent, currentFilePath, innerLineOffset, paramEntities, generalEntities, overriddenEntities, true);
            return true;
        } else if (resolvedCondition === 'IGNORE') {
            return false;
        }

        return null;
    }

    _resolveCondition(rawCondition, paramEntities) {
        let condition = rawCondition;
        let depth = 0;

        while (condition.startsWith('%') && depth < 10) {
            const name = condition.replace(/^%|;$/g, '').trim();
            const ent = paramEntities[name];
            if (!ent) return null;

            if (ent.systemUrl && ent.resolvedPath) {
                if (!ent.value) {
                    const fileContent = this._safeRead(ent.resolvedPath);
                    if (fileContent !== null) {
                        ent.value = fileContent.trim();
                    }
                }
                condition = (ent.value || '').trim();
            } else {
                condition = (ent.value || '').trim();
            }

            depth++;
        }

        return condition.replace(/["']/g, '').trim().toUpperCase() || null;
    }

    _findEntityEnd(content, startIndex) {
        let i = startIndex + 8;
        let inQuote = false;
        let quoteChar = '';
        while (i < content.length) {
            const ch = content[i];
            if ((ch === '"' || ch === "'") && !inQuote) {
                inQuote = true;
                quoteChar = ch;
            } else if (ch === quoteChar && inQuote) {
                inQuote = false;
            } else if (ch === '>' && !inQuote) {
                break;
            }
            i++;
        }
        return i;
    }

    _extractConditionalSection(content, startIndex) {
        let depth = 1;
        let i = startIndex + 3;
        while (i < content.length - 2) {
            if (content.startsWith('<![', i)) {
                depth++;
                i += 3;
            } else if (content.startsWith(']]>', i)) {
                depth--;
                if (depth === 0) break;
                i += 3;
            } else {
                i++;
            }
        }
        return { end: i, section: content.substring(startIndex, i + 3) };
    }

    _safeRead(filePath) {
        try {
            return this._readFile(filePath);
        } catch (e) {
            return null;
        }
    }
}

module.exports = FboEntParser;
