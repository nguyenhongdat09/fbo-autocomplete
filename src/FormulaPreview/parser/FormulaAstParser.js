/**
 * FormulaAstParser — Lexer & Recursive Descent Parser cho công thức g.$a của FBO
 */

class FormulaAstParser {
    /**
     * Parse chuỗi biểu thức (vế phải của `:=`) thành AST
     * @param {string} formulaText
     * @returns {object|null} ExprNode
     */
    static parse(formulaText) {
        if (!formulaText || typeof formulaText !== 'string') return null;
        try {
            const tokens = this.tokenize(formulaText.trim());
            if (tokens.length === 0) return null;
            let cursor = 0;

            const peek = () => tokens[cursor] || { type: 'EOF' };
            const consume = () => tokens[cursor++];
            const expect = (val) => {
                const t = consume();
                if (t.value !== val) {
                    throw new Error(`Expected '${val}' but found '${t.value || t.type}'`);
                }
                return t;
            };

            // grammar: expr := ternary
            const parseExpr = () => parseTernary();

            // ternary := cmp ('?' expr ':' expr)?
            const parseTernary = () => {
                let node = parseCmp();
                if (peek().type === 'OP' && peek().value === '?') {
                    consume(); // '?'
                    const thenNode = parseExpr();
                    expect(':');
                    const elseNode = parseExpr();
                    return {
                        type: 'ternary',
                        cond: node,
                        then: thenNode,
                        else: elseNode
                    };
                }
                return node;
            };

            // cmp := add (('=='|'!='|'>='|'<='|'>'|'<') add)?
            const parseCmp = () => {
                let left = parseAdd();
                const opTok = peek();
                if (opTok.type === 'OP' && ['==', '!=', '>=', '<=', '>', '<'].includes(opTok.value)) {
                    consume();
                    const right = parseAdd();
                    return {
                        type: 'cmp',
                        op: opTok.value,
                        left,
                        right
                    };
                }
                return left;
            };

            // add := mul (('+'|'-') mul)*
            const parseAdd = () => {
                let left = parseMul();
                while (peek().type === 'OP' && (peek().value === '+' || peek().value === '-')) {
                    const op = consume().value;
                    const right = parseMul();
                    left = {
                        type: 'binary',
                        op,
                        left,
                        right
                    };
                }
                return left;
            };

            // mul := unary (('*'|'/') unary)*
            const parseMul = () => {
                let left = parseUnary();
                while (peek().type === 'OP' && (peek().value === '*' || peek().value === '/')) {
                    const op = consume().value;
                    const right = parseUnary();
                    left = {
                        type: 'binary',
                        op,
                        left,
                        right
                    };
                }
                return left;
            };

            // unary := '-' unary | primary
            const parseUnary = () => {
                if (peek().type === 'OP' && peek().value === '-') {
                    consume();
                    const arg = parseUnary();
                    return {
                        type: 'unary',
                        op: '-',
                        arg
                    };
                }
                return parsePrimary();
            };

            // primary := number | string | field | call | '(' expr ')'
            const parsePrimary = () => {
                const t = peek();
                if (t.type === 'NUMBER') {
                    consume();
                    return { type: 'number', value: t.value };
                }
                if (t.type === 'STRING') {
                    consume();
                    return { type: 'string', value: t.value };
                }
                if (t.type === 'IDENT' || t.type === 'FIELD') {
                    const identName = (t.name || t.value || '').toLowerCase();
                    if (identName === 'round') {
                        const nextTok = tokens[cursor + 1];
                        if (nextTok && nextTok.type === 'LPAREN') {
                            consume(); // consume 'round'
                            consume(); // consume '('
                            const args = [parseExpr()];
                            while (peek().type === 'COMMA') {
                                consume(); // consume ','
                                args.push(parseExpr());
                            }
                            expect(')');
                            return {
                                type: 'call',
                                name: 'round',
                                args
                            };
                        }
                    }
                    consume();
                    return { type: 'field', name: t.name || t.value };
                }
                if (t.type === 'LPAREN') {
                    consume();
                    const expr = parseExpr();
                    expect(')');
                    return expr;
                }
                throw new Error(`Unexpected token: ${t.type} (${t.value})`);
            };

            const ast = parseExpr();
            return ast;
        } catch (e) {
            return null;
        }
    }

    /**
     * Tách token từ chuỗi
     * @param {string} text
     * @returns {Array<object>}
     */
    static tokenize(text) {
        const tokens = [];
        let i = 0;
        const len = text.length;

        while (i < len) {
            const ch = text[i];

            if (/\s/.test(ch)) {
                i++;
                continue;
            }

            if (ch === '(') {
                tokens.push({ type: 'LPAREN', value: '(' });
                i++;
                continue;
            }

            if (ch === ')') {
                tokens.push({ type: 'RPAREN', value: ')' });
                i++;
                continue;
            }

            if (ch === ',') {
                tokens.push({ type: 'COMMA', value: ',' });
                i++;
                continue;
            }

            // String literal: "..." or '...'
            if (ch === '"' || ch === "'") {
                const quote = ch;
                let strVal = '';
                let j = i + 1;
                while (j < len && text[j] !== quote) {
                    strVal += text[j];
                    j++;
                }
                tokens.push({ type: 'STRING', value: strVal });
                i = j + 1;
                continue;
            }

            // Field: [name] or [$name]
            if (ch === '[') {
                const closeIdx = text.indexOf(']', i + 1);
                if (closeIdx !== -1) {
                    let fieldName = text.substring(i + 1, closeIdx).trim();
                    if (fieldName.startsWith('$')) {
                        fieldName = fieldName.substring(1);
                    }
                    tokens.push({ type: 'FIELD', name: fieldName });
                    i = closeIdx + 1;
                    continue;
                }
            }

            // Two-character operators: ==, !=, >=, <=
            const twoChar = text.substring(i, i + 2);
            if (['==', '!=', '>=', '<='].includes(twoChar)) {
                tokens.push({ type: 'OP', value: twoChar });
                i += 2;
                continue;
            }

            // Single character operators: +, -, *, /, ?, :, >, <
            if (['+', '-', '*', '/', '?', ':', '>', '<'].includes(ch)) {
                tokens.push({ type: 'OP', value: ch });
                i++;
                continue;
            }

            // Numbers: 10, 10.5, etc.
            if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] || ''))) {
                let numStr = '';
                while (i < len && /[0-9.]/.test(text[i])) {
                    numStr += text[i];
                    i++;
                }
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
                continue;
            }

            // Fallback unquoted identifier (nếu có viết tắt không bọc bracket hoặc tên hàm như round)
            if (/[a-zA-Z_]/.test(ch)) {
                let ident = '';
                while (i < len && /[a-zA-Z0-9_$]/.test(text[i])) {
                    ident += text[i];
                    i++;
                }
                if (ident.toLowerCase() === 'round') {
                    tokens.push({ type: 'IDENT', value: ident });
                } else {
                    if (ident.startsWith('$')) ident = ident.substring(1);
                    tokens.push({ type: 'FIELD', name: ident });
                }
                continue;
            }

            i++;
        }

        return tokens;
    }

    /**
     * Thu thập danh sách các trường được đọc (refs) trong AST
     * @param {object} ast
     * @returns {string[]}
     */
    static collectRefs(ast) {
        const refs = new Set();
        function traverse(node) {
            if (!node) return;
            if (node.type === 'field') {
                refs.add(node.name);
            } else if (node.type === 'call') {
                (node.args || []).forEach(arg => traverse(arg));
            } else if (node.type === 'binary' || node.type === 'cmp') {
                traverse(node.left);
                traverse(node.right);
            } else if (node.type === 'unary') {
                traverse(node.arg);
            } else if (node.type === 'ternary') {
                traverse(node.cond);
                traverse(node.then);
                traverse(node.else);
            }
        }
        traverse(ast);
        return Array.from(refs);
    }

    /**
     * Chuyển đổi AST thành câu diễn giải tiếng Việt thân thiện cho BA/User
     * @param {object} ast
     * @param {Record<string, object>} fieldLookup
     * @returns {string}
     */
    static toPlainVi(ast, fieldLookup = {}) {
        if (!ast) return '';

        const getLabel = (name) => {
            const info = fieldLookup[name];
            if (info && (info.header_v || info.header_e)) {
                return info.header_v || info.header_e;
            }
            return name;
        };

        const renderNode = (node, parentPrec = 0) => {
            if (!node) return '';

            if (node.type === 'number') {
                return String(node.value);
            }

            if (node.type === 'string') {
                return `"${node.value}"`;
            }

            if (node.type === 'field') {
                return getLabel(node.name);
            }

            if (node.type === 'call') {
                if (node.name && node.name.toLowerCase() === 'round') {
                    const exprStr = renderNode(node.args[0]);
                    if (node.args.length > 1) {
                        const decStr = renderNode(node.args[1]);
                        return `Làm tròn(${exprStr}, ${decStr} chữ số)`;
                    }
                    return `Làm tròn(${exprStr})`;
                }
                const argsStr = (node.args || []).map(a => renderNode(a)).join(', ');
                return `${node.name}(${argsStr})`;
            }

            if (node.type === 'unary') {
                return `−${renderNode(node.arg, 4)}`;
            }

            if (node.type === 'binary') {
                let opSymbol = node.op;
                let prec = 1;
                if (node.op === '*') { opSymbol = '×'; prec = 3; }
                else if (node.op === '/') { opSymbol = '/'; prec = 3; }
                else if (node.op === '+') { opSymbol = '+'; prec = 2; }
                else if (node.op === '-') { opSymbol = '−'; prec = 2; }

                const leftStr = renderNode(node.left, prec);
                const rightStr = renderNode(node.right, prec);
                const res = `${leftStr} ${opSymbol} ${rightStr}`;
                return prec < parentPrec ? `(${res})` : res;
            }

            if (node.type === 'cmp') {
                let opVi = node.op;
                if (node.op === '==') opVi = '=';
                else if (node.op === '!=') opVi = '≠';
                else if (node.op === '>') opVi = '>';
                else if (node.op === '<') opVi = '<';
                else if (node.op === '>=') opVi = '≥';
                else if (node.op === '<=') opVi = '≤';

                // Check boolean shorthand: phi_dvtn_yn == 0
                if (node.left && node.left.type === 'field' && node.right && node.right.type === 'number') {
                    const fieldInfo = fieldLookup[node.left.name];
                    const isBool = fieldInfo && fieldInfo.type === 'boolean';
                    if (isBool || node.left.name.endsWith('_yn')) {
                        if (node.op === '==' && node.right.value === 0) {
                            return `không tick ${getLabel(node.left.name)}`;
                        }
                        if (node.op === '!=' && node.right.value === 0) {
                            return `tick ${getLabel(node.left.name)}`;
                        }
                    }
                }

                return `${renderNode(node.left)} ${opVi} ${renderNode(node.right)}`;
            }

            if (node.type === 'ternary') {
                // Pattern FBO: [x] == 0 ? ([y] != 0 ? [z]/[y] : 0) : [x]
                if (
                    node.cond && node.cond.type === 'cmp' &&
                    node.then && node.then.type === 'ternary' &&
                    node.else && node.else.type === 'field' &&
                    node.cond.left && node.cond.left.type === 'field' &&
                    node.cond.left.name === node.else.name
                ) {
                    const fieldLabel = getLabel(node.else.name);
                    const innerCond = renderNode(node.then.cond);
                    const innerThen = renderNode(node.then.then);
                    return `Nếu ${fieldLabel} = 0 (chưa nhập) và ${innerCond}: tự tính ${innerThen}, ngược lại giữ nguyên ${fieldLabel}`;
                }

                // Pattern lồng nhau tổng quát: Nếu A và B thì ...
                if (node.then && node.then.type === 'ternary') {
                    const cond1 = renderNode(node.cond);
                    const cond2 = renderNode(node.then.cond);
                    const thenVal = renderNode(node.then.then);
                    const elseVal = renderNode(node.else);
                    return `Nếu (${cond1}) và (${cond2}): lấy ${thenVal}, ngược lại ${elseVal}`;
                }

                const condStr = renderNode(node.cond);
                const thenStr = renderNode(node.then);
                const elseStr = renderNode(node.else);
                return `Nếu ${condStr}: lấy ${thenStr}, ngược lại lấy ${elseStr}`;
            }

            return '';
        };

        return renderNode(ast);
    }
}

module.exports = FormulaAstParser;
