/**
 * FILE 1: analyzer.js (IMPROVED VERSION)
 * Parse g.$a và generate switch case với dependency graph chính xác
 */

/**
 * Main function: Generate switch case từ g.$a
 */
function generateSwitchCase(documentText) {
  const gaPattern = /g\.\$a\s*=\s*\{([^}]+)\}/s;
  const match = documentText.match(gaPattern);
  
  if (!match) {
    return '// Error: Không tìm thấy g.$a trong file này';
  }
  
  const gaContent = match[1];
  
  // Parse tất cả expressions
  const { calculations, aggregates } = parseExpressions(gaContent);
  
  // Build dependency graph
  const graph = buildDependencyGraph(calculations);
  
  // Get all input fields
  const inputFields = getAllInputFields(calculations, graph);
  
  // Generate switch cases
  let code = `switch (name) {\n`;
  
  for (const field of inputFields) {
    const caseCode = generateCase(field, calculations, aggregates, graph);
    if (caseCode) {
      code += caseCode;
    }
  }
  
  code += `  default:\n`;
  code += `    break;\n`;
  code += `}`;
  
  return code;
}

/**
 * Parse expressions
 */
function parseExpressions(gaContent) {
  const calculations = new Map();
  const aggregates = new Map();
  
  const lines = gaContent.split(/,\s*\n/).map(l => l.trim()).filter(l => l);
  
  for (const line of lines) {
    const cleanLine = line.replace(/,$/, '').trim();
    
    // Aggregate: ['field', 'source']
    const aggMatch = cleanLine.match(/(\w+):\s*\[\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\]/);
    if (aggMatch) {
      const [, alias, target, source] = aggMatch;
      aggregates.set(alias, { target, source });
      continue;
    }
    
    // Calculation: '[target]:=formula'
    const calcMatch = cleanLine.match(/(\w+):\s*['"]?\[(\w+)\]:=(.+?)['"]?$/);
    if (calcMatch) {
      const [, alias, target, formula] = calcMatch;
      const deps = extractDeps(formula);
      
      calculations.set(alias, {
        alias,
        target,
        formula,
        deps,
        isReverse: isReverseCalculation(formula, target)
      });
    }
  }
  
  return { calculations, aggregates };
}

/**
 * Check nếu là reverse calculation (tính ngược)
 * VD: '[gia]:=([gia] == 0 ? ([so_luong] != 0 ? [tien]/[so_luong] : 0) : [gia])'
 */
function isReverseCalculation(formula, target) {
  // Pattern: [target] == 0 ? ... : [target]
  // Hoặc có phép chia với target field
  const reversePattern = new RegExp(`\\[${target}\\]\\s*==\\s*0\\s*\\?`);
  return reversePattern.test(formula);
}

/**
 * Extract dependencies từ formula
 */
function extractDeps(formula) {
  const deps = [];
  const regex = /\[(\$?\w+)\]/g;
  let match;
  
  while ((match = regex.exec(formula)) !== null) {
    const dep = match[1];
    // Bỏ qua parent fields (có $)
    if (!dep.startsWith('$')) {
      deps.push(dep);
    }
  }
  
  // Remove duplicates
  return [...new Set(deps)];
}

/**
 * Build dependency graph với topological order
 */
function buildDependencyGraph(calculations) {
  const graph = {
    forward: new Map(),  // field -> expressions phụ thuộc vào nó
    reverse: new Map(),  // field -> expressions tính ra nó
    targets: new Map()   // target -> alias
  };
  
  // Initialize
  for (const [alias, calc] of calculations) {
    // Map target -> alias
    graph.targets.set(calc.target, alias);
    
    // Build forward dependencies
    for (const dep of calc.deps) {
      if (!graph.forward.has(dep)) {
        graph.forward.set(dep, new Set());
      }
      graph.forward.get(dep).add(alias);
    }
    
    // Build reverse dependencies (target <- deps)
    if (!graph.reverse.has(calc.target)) {
      graph.reverse.set(calc.target, new Set());
    }
    for (const dep of calc.deps) {
      graph.reverse.get(calc.target).add(dep);
    }
  }
  
  return graph;
}

/**
 * Get all input fields (fields mà user có thể nhập)
 */
function getAllInputFields(calculations, graph) {
  const fields = new Set();
  
  // Tất cả fields xuất hiện trong dependencies
  for (const calc of calculations.values()) {
    for (const dep of calc.deps) {
      fields.add(dep);
    }
  }
  
  // Tất cả target fields (có thể nhập trực tiếp)
  for (const calc of calculations.values()) {
    fields.add(calc.target);
  }
  
  return Array.from(fields).sort();
}

/**
 * Get affected expressions khi field thay đổi
 * QUAN TRỌNG: Loại bỏ reverse calculations
 */
function getAffectedExpressions(field, calculations, graph) {
  const affected = [];
  const visited = new Set();
  const queue = [field];
  
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    
    const deps = graph.forward.get(current);
    if (!deps) continue;
    
    for (const alias of deps) {
      const calc = calculations.get(alias);
      
      // KIỂM TRA: Nếu đang nhập field X, không tính reverse calc của X
      // VD: Nhập 'gia' -> không tính 'gia_sl' (vì gia_sl tính gia từ tien)
      if (calc.target === field && calc.isReverse) {
        continue;
      }
      
      affected.push(alias);
      
      // Tiếp tục với target của expression này
      if (calc.target !== current) {
        queue.push(calc.target);
      }
    }
  }
  
  // Sort theo topological order
  return topologicalSort(affected, calculations, graph);
}

/**
 * Topological sort để đảm bảo thứ tự tính toán đúng
 */
function topologicalSort(aliases, calculations, graph) {
  const sorted = [];
  const remaining = new Set(aliases);
  const inDegree = new Map();
  
  // Calculate in-degree (số dependencies)
  for (const alias of remaining) {
    const calc = calculations.get(alias);
    let degree = 0;
    
    for (const dep of calc.deps) {
      const depAlias = graph.targets.get(dep);
      if (depAlias && remaining.has(depAlias)) {
        degree++;
      }
    }
    
    inDegree.set(alias, degree);
  }
  
  // Kahn's algorithm
  while (remaining.size > 0) {
    let added = false;
    
    for (const alias of remaining) {
      if (inDegree.get(alias) === 0) {
        sorted.push(alias);
        remaining.delete(alias);
        added = true;
        
        // Giảm in-degree của các node phụ thuộc
        const calc = calculations.get(alias);
        if (calc) {
          for (const other of remaining) {
            const otherCalc = calculations.get(other);
            if (otherCalc.deps.includes(calc.target)) {
              inDegree.set(other, inDegree.get(other) - 1);
            }
          }
        }
      }
    }
    
    // Nếu còn cycle, thêm hết vào
    if (!added && remaining.size > 0) {
      sorted.push(...remaining);
      break;
    }
  }
  
  return sorted;
}

/**
 * Get affected aggregates
 */
function getAffectedAggregates(field, aggregates, calculations, graph) {
  const result = [];
  
  // Direct aggregates (field là source)
  for (const [alias, agg] of aggregates) {
    if (agg.source === field) {
      result.push(alias);
    }
  }
  
  // Indirect aggregates (field -> calc -> source -> aggregate)
  const affected = getAffectedExpressions(field, calculations, graph);
  for (const alias of affected) {
    const calc = calculations.get(alias);
    if (calc) {
      for (const [aggAlias, agg] of aggregates) {
        if (agg.source === calc.target && !result.includes(aggAlias)) {
          result.push(aggAlias);
        }
      }
    }
  }
  
  return result;
}

/**
 * Detect focus field (field cuối được tính)
 */
function detectFocusField(field, calculations, graph) {
  const affected = getAffectedExpressions(field, calculations, graph);
  
  if (affected.length === 0) return null;
  
  // Lấy expression cuối (sau khi sort)
  const lastAlias = affected[affected.length - 1];
  const lastCalc = calculations.get(lastAlias);
  
  return lastCalc ? lastCalc.target : null;
}

/**
 * Generate một case cho field
 */
function generateCase(field, calculations, aggregates, graph) {
  const calcs = getAffectedExpressions(field, calculations, graph);
  const aggs = getAffectedAggregates(field, aggregates, calculations, graph);
  
  if (calcs.length === 0 && aggs.length === 0) {
    return '';
  }
  
  let code = `  case '${field}':\n`;
  
  // Main validExpression
  if (calcs.length > 0) {
    const calcList = calcs.map(a => `g.$a.${a}`).join(', ');
    
    if (aggs.length > 0) {
      const aggList = aggs.map(a => `g.$a.${a}`).join(', ');
      
      // Detect focus field
      const focusField = detectFocusField(field, calculations, graph);
      
      if (focusField && focusField !== field) {
        code += `    g.validExpression(o, [${calcList}], [${aggList}], null, '${focusField}');\n`;
      } else {
        code += `    g.validExpression(o, [${calcList}], [${aggList}]);\n`;
      }
    } else {
      code += `    g.validExpression(o, [${calcList}]);\n`;
    }
  } else if (aggs.length > 0) {
    // Chỉ có aggregate
    const aggList = aggs.map(a => `g.$a.${a}`).join(', ');
    code += `    g.executeAggregate([${aggList}]);\n`;
  }
  
  code += `    break;\n`;
  
  return code;
}

module.exports = {
  generateSwitchCase
};