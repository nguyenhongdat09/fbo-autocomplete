import { useState, useCallback, useEffect } from 'react';

/**
 * Đánh giá giá trị từ cây cú pháp AST (không dùng eval)
 * @param {object} ast
 * @param {Record<string, number|boolean>} currentVals
 * @returns {number}
 */
export function evaluateAst(ast, currentVals) {
  if (!ast) return 0;
  switch (ast.type) {
    case 'number':
      return Number(ast.value) || 0;
    case 'string':
      return String(ast.value || '');
    case 'field': {
      const val = currentVals[ast.name];
      if (typeof val === 'boolean') return val ? 1 : 0;
      return Number(val) || 0;
    }
    case 'unary':
      return -evaluateAst(ast.arg, currentVals);
    case 'binary': {
      const l = evaluateAst(ast.left, currentVals);
      const r = evaluateAst(ast.right, currentVals);
      if (ast.op === '+') return l + r;
      if (ast.op === '-') return l - r;
      if (ast.op === '*') return l * r;
      if (ast.op === '/') return r === 0 ? 0 : l / r;
      return 0;
    }
    case 'cmp': {
      const l = evaluateAst(ast.left, currentVals);
      const r = evaluateAst(ast.right, currentVals);
      if (ast.op === '==') return l == r ? 1 : 0;
      if (ast.op === '!=') return l != r ? 1 : 0;
      if (ast.op === '>') return l > r ? 1 : 0;
      if (ast.op === '<') return l < r ? 1 : 0;
      if (ast.op === '>=') return l >= r ? 1 : 0;
      if (ast.op === '<=') return l <= r ? 1 : 0;
      return 0;
    }
    case 'ternary': {
      const cond = evaluateAst(ast.cond, currentVals);
      return (cond !== 0 && cond !== false)
        ? evaluateAst(ast.then, currentVals)
        : evaluateAst(ast.else, currentVals);
    }
    case 'call': {
      if (ast.name && ast.name.toLowerCase() === 'round') {
        const val = evaluateAst(ast.args[0], currentVals);
        if (ast.args && ast.args.length > 1) {
          const decimals = evaluateAst(ast.args[1], currentVals);
          const factor = Math.pow(10, decimals);
          return Math.round(val * factor) / factor;
        }
        return Math.round(val);
      }
      return 0;
    }
    default:
      return 0;
  }
}

/**
 * Hook tính toán các giá trị trên sân chơi dựa trên AST của g.$a
 * @param {object} model FormulaModel
 */
export function useFormulaEvaluator(model) {
  const [values, setValues] = useState({});
  const [lastWritten, setLastWritten] = useState([]);
  const [lastFormulaCaption, setLastFormulaCaption] = useState('');

  // Tính toán lại theo chuỗi phụ thuộc trong g.$a (Path Nguyên tệ chuẩn)
  const recalcValues = useCallback((baseValues) => {
    if (!model || !model.entries) return;

    const entryMap = new Map();
    model.entries.forEach(e => entryMap.set(e.alias, e));

    const chain = model.default_demo_chain || Array.from(entryMap.keys());
    const nextVals = { ...baseValues };
    const written = [];
    let firstCaption = '';

    for (const alias of chain) {
      const entry = entryMap.get(alias);
      if (!entry) continue;

      if (entry.kind === 'formula' && entry.ast && entry.target) {
        const res = evaluateAst(entry.ast, nextVals);
        nextVals[entry.target] = Math.round(res * 100) / 100;
        if (!written.includes(entry.target)) written.push(entry.target);
        if (!firstCaption && entry.plain_vi) firstCaption = entry.plain_vi;
      } else if (entry.kind === 'aggregate_filter' && entry.master && entry.grid_col) {
        const isFilterOk = entry.filter_ast ? (evaluateAst(entry.filter_ast, nextVals) !== 0) : true;
        const gridVal = entry.grid_col_ast ? evaluateAst(entry.grid_col_ast, nextVals) : (nextVals[entry.grid_col] || 0);
        nextVals[entry.master] = isFilterOk ? gridVal : 0;
        if (!written.includes(entry.master)) written.push(entry.master);
      } else if (entry.kind === 'aggregate' && entry.master && entry.grid_col) {
        const gridVal = entry.grid_col_ast ? evaluateAst(entry.grid_col_ast, nextVals) : (nextVals[entry.grid_col] || 0);
        nextVals[entry.master] = gridVal;
        if (!written.includes(entry.master)) written.push(entry.master);
      }
    }

    setValues(nextVals);
    setLastWritten(written);
    if (firstCaption) setLastFormulaCaption(firstCaption);
  }, [model]);

  // Khởi tạo giá trị ban đầu từ model.playground.values khi model thay đổi
  useEffect(() => {
    if (model) {
      const seed = (model.playground && model.playground.values) ? { ...model.playground.values } : {};
      setValues(seed);
      recalcValues(seed);
    }
  }, [model, recalcValues]);

  // Cập nhật giá trị 1 trường khi người dùng gõ
  const updateFieldValue = useCallback((fieldName, val) => {
    const nextVals = { ...(values || {}), [fieldName]: val };
    setValues(nextVals);
    recalcValues(nextVals);
  }, [values, recalcValues]);

  // Reset về giá trị seed ban đầu
  const resetToSeed = useCallback(() => {
    if (model) {
      const seed = (model.playground && model.playground.values) ? { ...model.playground.values } : {};
      setValues(seed);
      recalcValues(seed);
    }
  }, [model, recalcValues]);

  return {
    values,
    lastWritten,
    lastFormulaCaption,
    updateFieldValue,
    recalcValues,
    resetToSeed
  };
}
