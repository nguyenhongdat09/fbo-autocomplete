const vscode = require('vscode');

// Thiết kế màu sắc theo Quy tắc 60 - 30 - 10 (Chuẩn Studio / Tokyo Night / JetBrains)
// 60% Neutral: Biến địa phương (v, o, result), thuộc tính (.Value), dấu ngoặc, toán tử -> Màu chữ trung tính
// 30% Sub-dominant: Keywords (tím/xanh trầm), Strings (cam đất), Numbers/Types (xanh mint), Entity (xanh lá XML)
// 10% Accent: Hàm gọi (Vàng óng), Biến cốt lõi FBO f, g, sender & biến SQL @var (Xanh Cyan)
const tokenTypes = [
    'keyword',       // 0: function, var, let, const, return, if, else, case, switch, true, false, null...
    'function',      // 1: setItemGridBehavior, getItemValue, isnull, exec StoredProc...
    'variable',      // 2: f, g, sender, @variables, @@sys
    'string',        // 3: '...', "..."
    'comment',       // 4: //..., /*...*/, --...
    'number',        // 5: 123, 0
    'type'           // 6: #temp_table, varchar, int
];

const legend = new vscode.SemanticTokensLegend(tokenTypes, []);

// Single-pass Master Regex cho JavaScript trong thẻ <script>
// Nhóm 1: Entity &...; (bỏ qua để giữ màu xanh lá mặc định của XML)
// Nhóm 2: Comment //... hoặc /*...*/
// Nhóm 3: String '...' hoặc "..."
// Nhóm 4: Number 123
// Nhóm 5: Keywords & Booleans/Null
// Nhóm 6: Function calls: name(...) -> Vàng Accent
// Nhóm 7: Core FBO Objects: f, g, sender -> Xanh Cyan Accent (còn lại biến v, o, result, thuộc tính .Value giữ màu trung tính dịu mắt)
const JS_TOKEN_RE = /(&[A-Za-z_][\w.-]*;)|(\/\/[^\r\n]*|\/\*.*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")|(\b\d+(?:\.\d+)?\b)|(\b(?:function|var|let|const|return|if|else|for|while|switch|case|break|default|continue|try|catch|finally|throw|new|this|typeof|instanceof|delete|in|true|false|null|undefined|async|await)\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|(\b(?:f|g|sender)\b)/g;

// Single-pass Master Regex cho SQL trong thẻ <commands>, <command>, <action>, <query>
// Nhóm 1: Entity &...; (bỏ qua)
// Nhóm 2: Comment --... hoặc /*...*/
// Nhóm 3: String '...' hoặc N'...'
// Nhóm 4: #temp_table (hỗ trợ cả dấu $) -> Type (xanh mint)
// Nhóm 5: @variable, @@sys, @$var, $$partition$current, m94$$partition$current -> Variable (xanh cyan)
// Nhóm 6: Number 123
// Nhóm 7: SQL Keywords -> Keyword (tím trầm)
// Nhóm 8: SQL Data types -> Type (xanh mint)
// Nhóm 9: Function calls: name(...) -> Vàng Accent
// Nhóm 10: Executed procedures: exec ProcName / exec dbo.ProcName -> Vàng Accent
const SQL_TOKEN_RE = /(&[A-Za-z_][\w.-]*;)|(--[^\r\n]*|\/\*.*?\*\/)|((?:\bN)?'(?:''|[^'])*')|(#[a-zA-Z0-9_$]+)|((?:@{1,2}\$?|\${1,2})[a-zA-Z0-9_$]+|[a-zA-Z_][a-zA-Z0-9_]*\$\$partition\$(?:current|previous))|(\b\d+(?:\.\d+)?\b)|(\b(?:SELECT|FROM|WHERE|INSERT|INTO|UPDATE|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|CROSS|ON|AND|OR|NOT|AS|IN|EXISTS|GROUP|BY|ORDER|HAVING|UNION|ALL|TOP|DISTINCT|VALUES|SET|EXEC|EXECUTE|DECLARE|BEGIN|END|IF|ELSE|RETURN|WHILE|CREATE|ALTER|DROP|TABLE|VIEW|PROCEDURE|FUNCTION|NOLOCK|IS|NULL|CASE|WHEN|THEN|WITH|OVER|PARTITION|GOTO)\b)|(\b(?:varchar|nvarchar|char|nchar|int|tinyint|smallint|bigint|decimal|numeric|money|float|datetime|smalldatetime|date|time|bit|text|ntext|binary|varbinary)\b)|(\b[a-zA-Z_$][a-zA-Z0-9_$]*(?=\s*\())|(?<=\b(?:exec|EXEC)\s+)([a-zA-Z_][a-zA-Z0-9_$.]*)/gi;

// Cache lưu phân tích block theo document version để đạt tốc độ tức thời 0ms khi cuộn
let cachedDocKey = '';
let cachedLines = [];
let cachedLineModes = [];

function getDocumentCache(document) {
    const key = `${document.uri.toString()}_${document.version}`;
    if (cachedDocKey === key) {
        return { lines: cachedLines, lineModes: cachedLineModes };
    }

    const text = document.getText();
    const lines = text.split(/\r?\n/);
    const lineCount = lines.length;
    const lineModes = new Array(lineCount);

    let currentMode = null; // 'js' | 'sql' | null
    let inXmlComment = false;
    let inBlockComment = false;
    let inEntity = false;

    for (let i = 0; i < lineCount; i++) {
        const line = lines[i];

        // 1. Kiểm tra XML comment <!-- ... -->
        if (inXmlComment) {
            lineModes[i] = null;
            if (line.includes('-->')) {
                inXmlComment = false;
            }
            continue;
        }

        if (line.includes('<!--')) {
            lineModes[i] = null;
            if (!line.includes('-->')) {
                inXmlComment = true;
            }
            continue;
        }

        // 2. Kiểm tra đóng mở thẻ block script hoặc sql
        if (/<script\b/i.test(line)) {
            currentMode = 'js';
            inBlockComment = false;
            lineModes[i] = null;
            continue;
        }
        if (/<\/script>/i.test(line)) {
            currentMode = null;
            inBlockComment = false;
            lineModes[i] = null;
            continue;
        }
        if (/<(?:commands|command|action|query)\b/i.test(line)) {
            currentMode = 'sql';
            inBlockComment = false;
            lineModes[i] = null;
            continue;
        }
        if (/<\/(?:commands|command|action|query)>/i.test(line)) {
            currentMode = null;
            inBlockComment = false;
            lineModes[i] = null;
            continue;
        }

        // 3. Kiểm tra khối <!ENTITY ... "
        if (/<!ENTITY\s+[\w.-]+\s+"/i.test(line)) {
            if (/">\s*$/i.test(line.trim())) {
                // Khai báo hằng số 1 dòng: <!ENTITY foo "bar"> -> giữ màu XML
                lineModes[i] = null;
                continue;
            }
            // Khối ENTITY nhiều dòng chứa code SQL
            currentMode = 'sql';
            inEntity = true;
            inBlockComment = false;
            lineModes[i] = null;
            continue;
        }
        if (inEntity && (line.trim() === '">' || line.trim().endsWith('">'))) {
            inEntity = false;
            currentMode = null;
            inBlockComment = false;
            lineModes[i] = null;
            continue;
        }

        // 3. Nếu đang trong block JS / SQL
        if (currentMode) {
            if (inBlockComment) {
                lineModes[i] = 'comment';
                if (line.includes('*/')) {
                    inBlockComment = false;
                }
                continue;
            }

            if (line.includes('/*') && !line.includes('*/')) {
                inBlockComment = true;
                lineModes[i] = 'comment';
                continue;
            }

            lineModes[i] = currentMode;
        } else {
            lineModes[i] = null;
        }
    }

    cachedDocKey = key;
    cachedLines = lines;
    cachedLineModes = lineModes;

    return { lines, lineModes };
}

function pushStringTokens(builder, lineIdx, startChar, str) {
    // Nếu chuỗi không chứa XML CDATA hoặc Entity thì push toàn bộ là string
    if (!str.includes(']]>') && !str.includes('<![CDATA[') && !/&[A-Za-z_][\w.-]*;/.test(str)) {
        builder.push(lineIdx, startChar, str.length, 3, 0); // 3: string
        return;
    }

    // Nếu chuỗi bị ngắt bởi ]]> hoặc Entity hoặc <![CDATA[, tách thành từng đoạn
    const SUB_RE = /(\]\]>|<!\[CDATA\[|&[A-Za-z_][\w.-]*;)/g;
    let lastIdx = 0;
    let subMatch;

    while ((subMatch = SUB_RE.exec(str)) !== null) {
        const textBeforeLen = subMatch.index - lastIdx;
        if (textBeforeLen > 0) {
            builder.push(lineIdx, startChar + lastIdx, textBeforeLen, 3, 0);
        }
        // subMatch[0] là ]]> hoặc <![CDATA[ hoặc &Entity; -> BỎ QUA không gán string
        // để VS Code tự tô màu Entity gốc (xanh lá cây) và XML CDATA delimiter!
        lastIdx = SUB_RE.lastIndex;
    }

    if (lastIdx < str.length) {
        builder.push(lineIdx, startChar + lastIdx, str.length - lastIdx, 3, 0);
    }
}

function pushCommentTokens(builder, lineIdx, startChar, str) {
    if (!str.includes(']]>') && !str.includes('<![CDATA[') && !/&[A-Za-z_][\w.-]*;/.test(str)) {
        builder.push(lineIdx, startChar, str.length, 4, 0); // 4: comment
        return;
    }

    const SUB_RE = /(\]\]>|<!\[CDATA\[|&[A-Za-z_][\w.-]*;)/g;
    let lastIdx = 0;
    let subMatch;

    while ((subMatch = SUB_RE.exec(str)) !== null) {
        const textBeforeLen = subMatch.index - lastIdx;
        if (textBeforeLen > 0) {
            builder.push(lineIdx, startChar + lastIdx, textBeforeLen, 4, 0);
        }
        lastIdx = SUB_RE.lastIndex;
    }

    if (lastIdx < str.length) {
        builder.push(lineIdx, startChar + lastIdx, str.length - lastIdx, 4, 0);
    }
}

class FboSemanticTokensProvider {
    provideDocumentSemanticTokens(document, token) {
        return this._computeTokens(document, null, token);
    }

    provideDocumentRangeSemanticTokens(document, range, token) {
        return this._computeTokens(document, range, token);
    }

    _computeTokens(document, range, cancelToken) {
        const builder = new vscode.SemanticTokensBuilder(legend);
        const { lines, lineModes } = getDocumentCache(document);
        const lineCount = lines.length;

        if (lineCount === 0 || lineCount > 20000) {
            return builder.build();
        }

        const startLine = range ? Math.max(0, range.start.line) : 0;
        const endLine = range ? Math.min(lineCount - 1, range.end.line) : lineCount - 1;

        for (let i = startLine; i <= endLine; i++) {
            if (cancelToken && cancelToken.isCancellationRequested) {
                return builder.build();
            }

            const currentMode = lineModes[i];
            if (!currentMode) {
                continue;
            }

            const text = lines[i];

            // Nếu là dòng trong multi-line comment /* ... */
            if (currentMode === 'comment') {
                if (text.trim().length > 0) {
                    builder.push(i, 0, text.length, 4, 0); // 4: comment
                }
                continue;
            }

            const regex = currentMode === 'js' ? JS_TOKEN_RE : SQL_TOKEN_RE;
            regex.lastIndex = 0;

            let match;
            while ((match = regex.exec(text)) !== null) {
                if (match[1]) {
                    // Bỏ qua Entity &...; để TextMate XML mặc định của VS Code tự tô màu xanh lá, đồng bộ 100%
                    continue;
                }

                const tokenStr = match[0];
                const char = match.index;
                const len = tokenStr.length;

                let tokenTypeIdx = -1;

                if (currentMode === 'js') {
                    if (match[2]) {
                        pushCommentTokens(builder, i, char, tokenStr);
                        continue;
                    } else if (match[3]) {
                        pushStringTokens(builder, i, char, tokenStr);
                        continue;
                    }
                    else if (match[4]) tokenTypeIdx = 5; // number
                    else if (match[5]) tokenTypeIdx = 0; // keyword / boolean / null
                    else if (match[6]) tokenTypeIdx = 1; // function call: name(...) -> Vàng Accent
                    else if (match[7]) tokenTypeIdx = 2; // Core FBO: f, g, sender -> Xanh Cyan Accent
                } else {
                    if (match[2]) {
                        pushCommentTokens(builder, i, char, tokenStr);
                        continue;
                    } else if (match[3]) {
                        pushStringTokens(builder, i, char, tokenStr);
                        continue;
                    }
                    else if (match[4]) tokenTypeIdx = 6; // #temp_table -> type (xanh mint)
                    else if (match[5]) tokenTypeIdx = 2; // @variable / @@sys -> variable (xanh cyan)
                    else if (match[6]) tokenTypeIdx = 5; // number
                    else if (match[7]) tokenTypeIdx = 0; // keyword
                    else if (match[8]) tokenTypeIdx = 6; // datatype -> type (xanh mint)
                    else if (match[9] || match[10]) tokenTypeIdx = 1; // function call / exec stored proc -> function (vàng)
                }

                if (tokenTypeIdx >= 0) {
                    builder.push(i, char, len, tokenTypeIdx, 0);
                }
            }
        }

        return builder.build();
    }
}

function registerFboSemanticTokens(context) {
    const selector = { language: 'xml', scheme: 'file' };
    const provider = new FboSemanticTokensProvider();

    const rangeDisposable = vscode.languages.registerDocumentRangeSemanticTokensProvider(
        selector,
        provider,
        legend
    );
    const docDisposable = vscode.languages.registerDocumentSemanticTokensProvider(
        selector,
        provider,
        legend
    );

    context.subscriptions.push(rangeDisposable, docDisposable);
    console.log('⚡ [FBO Semantic Tokens] Registered ultra-fast syntax highlighter for FBO XML.');
}

module.exports = {
    registerFboSemanticTokens,
    legend
};
