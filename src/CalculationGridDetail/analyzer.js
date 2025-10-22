/**
 * analyzer.js - FIXED VERSION
 * Phân biệt 2 loại aggregate: simple (từ grid) và computed (trên form)
 */

function generateSwitchCase(documentText) {
  const gaPattern = /g\.\$a\s*=\s*\{([^}]+)\}/s;
  const match = documentText.match(gaPattern);
  
  if (!match) {
    return '// Error: Không tìm thấy g.$a trong file này';
  }
  
  const gaContent = match[1];
  
  // Parse tất cả expressions
  const { calculations, simpleAggregates, computedAggregates } = parseExpressions(gaContent);
  
  // Build dependency graph
  const graph = buildDependencyGraph(calculations, computedAggregates);
  
  // Get all input fields
  const inputFields = getAllInputFields(calculations, graph);
  
  // Generate switch cases
  let code = `switch (name) {\n`;
  
  for (const field of inputFields) {
    const caseCode = generateCase(field, calculations, simpleAggregates, computedAggregates, graph);
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
 * Parse expressions - PHÂN BIỆT 2 LOẠI AGGREGATE
 */
function parseExpressions(gaContent) {
  const calculations = new Map();
  const simpleAggregates = new Map();      // ['t_tien', 'tien'] - Tổng từ grid
  const computedAggregates = new Map();    // '[t_tt]:=[t_tien]+[t_thue]' - Tính trên form
  
  const lines = gaContent.split(/,\s*\n/).map(l => l.trim()).filter(l => l);
  
  for (const line of lines) {
    const cleanLine = line.replace(/,$/, '').trim();
    
    // 1. Simple Aggregate: ['field', 'source']
    const simpleAggMatch = cleanLine.match(/(\w+):\s*\[\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]\s*\]/);
    if (simpleAggMatch) {
      const [, alias, target, source] = simpleAggMatch;
      simpleAggregates.set(alias, { target, source });
      continue;
    }
    
    // 2. Calculation hoặc Computed Aggregate: '[target]:=formula'
    const calcMatch = cleanLine.match(/(\w+):\s*['"]?\[(\w+)\]:=(.+?)['"]?$/);
    if (calcMatch) {
      const [, alias, target, formula] = calcMatch;
      const deps = extractDeps(formula);
      
      const calc = {
        alias,
        target,
        formula,
        deps,
        isReverse: isReverseCalculation(formula, target)
      };
      
      // Phân biệt: Nếu tất cả deps đều là target của simpleAggregate → đây là computedAggregate
      const isComputed = deps.length > 0 && deps.every(dep => 
        Array.from(simpleAggregates.values()).some(agg => agg.target === dep)
      );
      
      if (isComputed) {
        computedAggregates.set(alias, calc);
      } else {
        calculations.set(alias, calc);
      }
    }
  }
  
  return { calculations, simpleAggregates, computedAggregates };
}

/**
 * Check nếu là reverse calculation
 */
function isReverseCalculation(formula, target) {
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
    if (!dep.startsWith('$')) {
      deps.push(dep);
    }
  }
  
  return [...new Set(deps)];
}

/**
 * Build dependency graph - BAO GỒM CẢ COMPUTED AGGREGATES
 */
function buildDependencyGraph(calculations, computedAggregates) {
  const graph = {
    forward: new Map(),
    reverse: new Map(),
    targets: new Map()
  };
  
  // Merge calculations và computedAggregates để build graph
  const allCalcs = new Map([...calculations, ...computedAggregates]);
  
  for (const [alias, calc] of allCalcs) {
    graph.targets.set(calc.target, alias);
    
    for (const dep of calc.deps) {
      if (!graph.forward.has(dep)) {
        graph.forward.set(dep, new Set());
      }
      graph.forward.get(dep).add(alias);
    }
    
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
 * Get all input fields
 */
function getAllInputFields(calculations, graph) {
  const fields = new Set();
  
  for (const calc of calculations.values()) {
    for (const dep of calc.deps) {
      fields.add(dep);
    }
    fields.add(calc.target);
  }
  
  return Array.from(fields).sort();
}

/**
 * Get affected expressions - KHÔNG BAO GỒM COMPUTED AGGREGATES
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
      
      // Chỉ xử lý calculations, bỏ qua computed aggregates
      if (!calc) continue;
      
      if (calc.target === field && calc.isReverse) {
        continue;
      }
      
      affected.push(alias);
      
      if (calc.target !== current) {
        queue.push(calc.target);
      }
    }
  }
  
  return topologicalSort(affected, calculations, graph);
}

/**
 * Topological sort
 */
function topologicalSort(aliases, calculations, graph) {
  const sorted = [];
  const remaining = new Set(aliases);
  const inDegree = new Map();
  
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
  
  while (remaining.size > 0) {
    let added = false;
    
    for (const alias of remaining) {
      if (inDegree.get(alias) === 0) {
        sorted.push(alias);
        remaining.delete(alias);
        added = true;
        
        const calc = calculations.get(alias);
        if (calc) {
          for (const other of remaining) {
            const otherCalc = calculations.get(other);
            if (otherCalc && otherCalc.deps.includes(calc.target)) {
              inDegree.set(other, inDegree.get(other) - 1);
            }
          }
        }
      }
    }
    
    if (!added && remaining.size > 0) {
      sorted.push(...remaining);
      break;
    }
  }
  
  return sorted;
}

/**
 * Get affected simple aggregates (từ grid)
 */
function getAffectedSimpleAggregates(field, simpleAggregates, calculations, graph) {
  const result = [];
  
  // Direct: field là source
  for (const [alias, agg] of simpleAggregates) {
    if (agg.source === field) {
      result.push(alias);
    }
  }
  
  // Indirect: field -> calc -> source -> aggregate
  const affected = getAffectedExpressions(field, calculations, graph);
  for (const alias of affected) {
    const calc = calculations.get(alias);
    if (calc) {
      for (const [aggAlias, agg] of simpleAggregates) {
        if (agg.source === calc.target && !result.includes(aggAlias)) {
          result.push(aggAlias);
        }
      }
    }
  }
  
  return result;
}

/**
 * Get affected computed aggregates (tính trên form)
 * QUAN TRỌNG: Chỉ khi có simple aggregate bị ảnh hưởng
 */
function getAffectedComputedAggregates(field, simpleAggregates, computedAggregates, calculations, graph) {
  const result = [];
  
  // Lấy danh sách simple aggregates bị ảnh hưởng
  const affectedSimple = getAffectedSimpleAggregates(field, simpleAggregates, calculations, graph);
  
  if (affectedSimple.length === 0) {
    return result;
  }
  
  // Lấy targets của simple aggregates
  const simpleTargets = affectedSimple.map(alias => simpleAggregates.get(alias).target);
  
  // Tìm computed aggregates phụ thuộc vào simple targets
  for (const [alias, compAgg] of computedAggregates) {
    const hasSimpleDep = compAgg.deps.some(dep => simpleTargets.includes(dep));
    
    if (hasSimpleDep && !result.includes(alias)) {
      result.push(alias);
    }
  }
  
  return result;
}

/**
 * Detect focus field
 */
function detectFocusField(field, calculations, graph) {
  const affected = getAffectedExpressions(field, calculations, graph);
  
  if (affected.length === 0) return null;
  
  const lastAlias = affected[affected.length - 1];
  const lastCalc = calculations.get(lastAlias);
  
  return lastCalc ? lastCalc.target : null;
}

/**
 * Generate một case cho field
 */
function generateCase(field, calculations, simpleAggregates, computedAggregates, graph) {
  const calcs = getAffectedExpressions(field, calculations, graph);
  const simpleAggs = getAffectedSimpleAggregates(field, simpleAggregates, calculations, graph);
  const computedAggs = getAffectedComputedAggregates(field, simpleAggregates, computedAggregates, calculations, graph);
  
  if (calcs.length === 0 && simpleAggs.length === 0 && computedAggs.length === 0) {
    return '';
  }
  
  let code = `  case '${field}':\n`;
  
  // Tham số 1: calculations
  const calcList = calcs.length > 0 
    ? calcs.map(a => `g.$a.${a}`).join(', ')
    : null;
  
  // Tham số 2: simple aggregates (từ grid)
  const simpleAggList = simpleAggs.length > 0
    ? simpleAggs.map(a => `g.$a.${a}`).join(', ')
    : null;
  
  // Tham số 3: computed aggregates (tính trên form)
  const computedAggList = computedAggs.length > 0
    ? computedAggs.map(a => `g.$a.${a}`).join(', ')
    : null;
  
  // Tham số 4: focus field
  const focusField = detectFocusField(field, calculations, graph);
  const focusParam = (focusField && focusField !== field) 
    ? `'${focusField}'` 
    : null;
  
  // Build validExpression call
  const params = [];
  
  if (calcList) {
    params.push(`[${calcList}]`);
  } else {
    params.push('[]');
  }
  
  if (simpleAggList || computedAggList || focusParam) {
    params.push(simpleAggList ? `[${simpleAggList}]` : '[]');
  }
  
  if (computedAggList || focusParam) {
    params.push(computedAggList ? `[${computedAggList}]` : 'null');
  }
  
  if (focusParam) {
    params.push(focusParam);
  }
  
  code += `    g.validExpression(o, ${params.join(', ')});\n`;
  code += `    break;\n`;
  
  return code;
}

module.exports = {
  generateSwitchCase
};