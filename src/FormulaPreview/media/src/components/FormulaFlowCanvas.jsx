import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider
} from '@xyflow/react';
import dagre from 'dagre';
import { evaluateAst } from '../hooks/useFormulaEvaluator';
import { GROUP_LABELS } from '../utils/groupConstants';
import FieldNode from './CustomNodes/FieldNode';
import AggregateNode from './CustomNodes/AggregateNode';

const nodeTypes = {
  fieldNode: FieldNode,
  aggregateNode: AggregateNode
};

function getLayoutedElements(nodes, edges, direction = 'LR') {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 35, ranksep: 70 });

  nodes.forEach((node) => {
    const isAgg = node.type === 'aggregateNode';
    const hasFilter = Boolean(node.data && node.data.filter);
    const width = isAgg ? (hasFilter ? 170 : 130) : 150;
    const height = isAgg ? (hasFilter ? 75 : 55) : 65;
    dagreGraph.setNode(node.id, { width, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const isAgg = node.type === 'aggregateNode';
    const hasFilter = Boolean(node.data && node.data.filter);
    const width = isAgg ? (hasFilter ? 170 : 130) : 150;
    const height = isAgg ? (hasFilter ? 75 : 55) : 65;

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function collectRelatedNodeIds(startId, edges) {
  if (!startId || !edges) return null;
  const adj = new Map();
  edges.forEach((edge) => {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source).push(edge.target); // CHỈ MỘT CHIỀU: source -> target
  });

  const visited = new Set();
  const queue = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const curr = queue.shift();
    const neighbors = adj.get(curr) || [];
    for (const n of neighbors) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }
  }
  return visited;
}

function applyFocusStyles(nodes, edges, focusNodeId) {
  const relatedNodeIds = focusNodeId ? collectRelatedNodeIds(focusNodeId, edges) : null;

  const styledNodes = nodes.map((node) => {
    const isRelated = !relatedNodeIds || relatedNodeIds.has(node.id);
    const isFocused = node.id === focusNodeId;
    const isDimmed = relatedNodeIds ? !isRelated : false;
    return {
      ...node,
      data: {
        ...node.data,
        dimmed: isDimmed,
      },
      style: {
        ...node.style,
        opacity: isDimmed ? 0.25 : 1,
        transition: 'opacity 0.2s ease',
        zIndex: isFocused ? 10 : (isRelated ? 2 : 0)
      }
    };
  });

  const styledEdges = edges.map((edge) => {
    const isRelated = !relatedNodeIds || (relatedNodeIds.has(edge.source) && relatedNodeIds.has(edge.target));
    return {
      ...edge,
      style: {
        ...edge.style,
        opacity: isRelated ? 1 : 0.12,
        strokeWidth: isRelated && focusNodeId ? (edge.style?.strokeWidth || 1.5) + 0.5 : (edge.style?.strokeWidth || 1.5),
        transition: 'opacity 0.2s ease'
      }
    };
  });

  return { styledNodes, styledEdges };
}

const FlowInner = ({
  model,
  values,
  lastWritten,
  onNodeSelect,
  focusedField
}) => {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [focusNodeId, setFocusNodeId] = useState(null);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Reset focus khi đổi model hoặc đổi nhóm filter
  useEffect(() => {
    setFocusNodeId(null);
  }, [model, selectedGroup]);

  // Cập nhật opacity của nodes và edges khi đổi focusNodeId mà không tính lại layout dagre
  useEffect(() => {
    setEdges((prevEdges) => {
      if (!prevEdges || prevEdges.length === 0) return prevEdges;
      const relatedNodeIds = focusNodeId ? collectRelatedNodeIds(focusNodeId, prevEdges) : null;

      setNodes((prevNodes) => {
        if (!prevNodes || prevNodes.length === 0) return prevNodes;
        return prevNodes.map((node) => {
          const isRelated = !relatedNodeIds || relatedNodeIds.has(node.id);
          const isFocused = node.id === focusNodeId;
          const isDimmed = relatedNodeIds ? !isRelated : false;
          return {
            ...node,
            data: {
              ...node.data,
              dimmed: isDimmed,
            },
            style: {
              ...node.style,
              opacity: isDimmed ? 0.25 : 1,
              transition: 'opacity 0.2s ease',
              zIndex: isFocused ? 10 : (isRelated ? 2 : 0)
            }
          };
        });
      });

      return prevEdges.map((edge) => {
        const isRelated = !relatedNodeIds || (relatedNodeIds.has(edge.source) && relatedNodeIds.has(edge.target));
        return {
          ...edge,
          style: {
            ...edge.style,
            opacity: isRelated ? 1 : 0.12,
            strokeWidth: isRelated && focusNodeId ? (edge.style?.strokeWidth || 1.5) + 0.5 : (edge.style?.strokeWidth || 1.5),
            transition: 'opacity 0.2s ease'
          }
        };
      });
    });
  }, [focusNodeId]);

  // Tự động fitView và hỗ trợ phím Escape khi bật / tắt toàn màn hình
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.15, duration: 250 });
    }, 150);
    return () => clearTimeout(timer);
  }, [isFullscreen, fitView]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Xây dựng graph data từ entries của g.$a
  useEffect(() => {
    if (!model || !model.entries) return;

    const entries = model.entries || [];
    const entryMap = new Map();
    entries.forEach(e => entryMap.set(e.alias, e));
    const fields = model.fields || {};

    const rawNodesMap = new Map();
    const rawEdges = [];

    // Chọn danh sách alias để vẽ (FIX-15: tab 'all' vẽ toàn bộ entries)
    let aliasesToRender = entries.map(e => e.alias);

    if (selectedGroup !== 'all') {
      aliasesToRender = entries.filter(e => {
        if (selectedGroup === 'amount_qty') return e.group === 'amount' || e.group === 'qty_price';
        return e.group === selectedGroup;
      }).map(e => e.alias);
    }

    const renderedAliasesSet = new Set(aliasesToRender);

    // Tiền tính toán computedFields cho các alias đang render (FIX-17)
    const computedFields = new Set();
    entries.forEach(e => {
      if (!renderedAliasesSet.has(e.alias)) return;
      if (e.kind === 'formula' && e.target) {
        computedFields.add(e.target);
      }
      if ((e.kind === 'aggregate' || e.kind === 'aggregate_filter') && e.master) {
        computedFields.add(e.master);
      }
    });

    // Helper tạo node
    const ensureFieldNode = (fieldName) => {
      const isComputed = computedFields.has(fieldName);
      const isInput = !isComputed;

      if (!rawNodesMap.has(fieldName)) {
        const fieldInfo = fields[fieldName] || {};
        rawNodesMap.set(fieldName, {
          id: fieldName,
          type: 'fieldNode',
          data: {
            name: fieldName,
            label: fieldInfo.header_v || fieldInfo.header_e || fieldName,
            value: values[fieldName],
            isInput,
            isJustUpdated: lastWritten.includes(fieldName),
          },
          selected: focusedField === fieldName,
          position: { x: 0, y: 0 }
        });
      } else {
        const node = rawNodesMap.get(fieldName);
        node.data.value = values[fieldName];
        node.data.isInput = isInput;
        node.data.isJustUpdated = lastWritten.includes(fieldName);
        node.selected = focusedField === fieldName;
      }
    };

    // 1. Duyệt formula entries
    entries.forEach(e => {
      if (e.kind === 'formula' && e.target && renderedAliasesSet.has(e.alias)) {
        ensureFieldNode(e.target);

        (e.refs || []).forEach(refName => {
          if (refName === e.target) return; // Bỏ qua self-edge (FIX-16)
          ensureFieldNode(refName);
          rawEdges.push({
            id: `edge-${e.alias}-${refName}->${e.target}`, // Unique edge id (FIX-16)
            source: refName,
            target: e.target,
            animated: lastWritten.includes(e.target),
            style: { stroke: '#4fc1ff', strokeWidth: 1.5 },
          });
        });
      }
    });

    // 2. Duyệt aggregate entries (refs -> Σ node -> master)
    entries.forEach(e => {
      if ((e.kind === 'aggregate' || e.kind === 'aggregate_filter') && renderedAliasesSet.has(e.alias)) {
        if (e.master) {
          ensureFieldNode(e.master);

          const isFilterOk = e.filter_ast ? (evaluateAst(e.filter_ast, values) !== 0) : true;
          let filterVi = e.filter_vi;
          if (!filterVi && e.plain_vi) {
            const m = e.plain_vi.match(/\((khi .*?)\)/i);
            if (m) filterVi = m[1];
          }

          const aggNodeId = `agg-${e.alias}`;
          rawNodesMap.set(aggNodeId, {
            id: aggNodeId,
            type: 'aggregateNode',
            data: {
              alias: e.alias,
              kind: e.kind,
              master: e.master,
              grid_col: e.grid_col,
              filter: e.filter,
              filter_vi: filterVi,
              plain_vi: e.plain_vi,
              isActive: isFilterOk,
            },
            position: { x: 0, y: 0 }
          });

          const sourceRefs = (e.refs && e.refs.length > 0) ? e.refs : (e.grid_col ? [e.grid_col] : []);
          sourceRefs.forEach(refName => {
            if (refName === e.master) return;
            ensureFieldNode(refName);
            rawEdges.push({
              id: `edge-${e.alias}-${refName}->${aggNodeId}`, // Unique edge id (FIX-16)
              source: refName,
              target: aggNodeId,
              style: {
                stroke: '#ba55d3',
                strokeDasharray: '4,4',
                strokeWidth: isFilterOk ? 2 : 1.5,
                opacity: isFilterOk ? 1 : 0.4
              },
            });
          });

          rawEdges.push({
            id: `edge-${e.alias}-${aggNodeId}->${e.master}`, // Unique edge id (FIX-16)
            source: aggNodeId,
            target: e.master,
            style: {
              stroke: '#ba55d3',
              strokeWidth: isFilterOk ? 2 : 1.5,
              opacity: isFilterOk ? 1 : 0.4
            },
          });
        }
      }
    });

    // Dagre Auto-layout
    const rawNodes = Array.from(rawNodesMap.values());
    if (rawNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rawNodes, rawEdges);
    const { styledNodes, styledEdges } = applyFocusStyles(layoutedNodes, layoutedEdges, focusNodeId);
    setNodes(styledNodes);
    setEdges(styledEdges);

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 });
    }, 50);
  }, [model, values, lastWritten, focusedField, selectedGroup, fitView]);

  const handleNodeClick = useCallback((event, node) => {
    if (node) {
      setFocusNodeId(node.id);
      if (node.type === 'fieldNode' && onNodeSelect) {
        onNodeSelect(node.data.name);
      }
    }
  }, [onNodeSelect]);

  const handlePaneClick = useCallback(() => {
    setFocusNodeId(null);
  }, []);

  return (
    <div className={`flow-section ${isFullscreen ? 'fullscreen' : ''}`}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        background: 'rgba(0,0,0,0.2)',
        borderBottom: '1px solid var(--border-color)',
        fontSize: '11px',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 600 }}>Sơ đồ luồng tính toán g.$a</span>
          {isFullscreen && (
            <span style={{ fontSize: '10px', color: 'var(--vscode-descriptionForeground)' }}>
              (Bấm Esc hoặc nút Thu nhỏ để trở về)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            {(() => {
              const availableGroups = model.groups || [];
              const hasAmountQty = availableGroups.includes('amount') || availableGroups.includes('qty_price');
              const chips = [{ id: 'all', label: 'Tất cả' }];

              if (hasAmountQty) {
                chips.push({ id: 'amount_qty', label: 'Tiền & Giá' });
              }

              availableGroups.forEach(g => {
                if (g !== 'amount' && g !== 'qty_price') {
                  chips.push({ id: g, label: GROUP_LABELS[g] || g });
                }
              });

              return chips.map(g => (
                <button
                  key={g.id}
                  className={`btn ${selectedGroup === g.id ? '' : 'btn-secondary'}`}
                  style={{ padding: '2px 8px', fontSize: '10px' }}
                  onClick={() => setSelectedGroup(g.id)}
                >
                  {g.label}
                </button>
              ));
            })()}
          </div>

          {focusNodeId && (
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: '10px', color: '#f48771', borderColor: 'rgba(244, 135, 113, 0.4)' }}
              onClick={() => setFocusNodeId(null)}
              title="Bỏ chế độ focus path (hoặc click vào nền trống)"
            >
              ✕ Bỏ focus
            </button>
          )}

          <button
            className={`btn ${isFullscreen ? '' : 'btn-secondary'}`}
            style={{ padding: '2px 8px', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Thu nhỏ (Esc)' : 'Mở toàn màn hình'}
          >
            <span>{isFullscreen ? '✕ Thu nhỏ' : '⛶ Toàn màn hình'}</span>
          </button>
        </div>
      </div>

      <div className="flow-canvas-body" style={{ flex: 1, width: '100%', position: 'relative', height: isFullscreen ? 'calc(100vh - 40px)' : '380px' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
        >
          <Background variant="dots" gap={14} size={1} color="rgba(255, 255, 255, 0.15)" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'aggregateNode') return '#ba55d3';
              if (node.data.isInput) return '#4ec9b0';
              return '#4fc1ff';
            }}
            style={{ height: 70, width: 110, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)' }}
          />
        </ReactFlow>
      </div>
    </div>
  );
};

export default function FormulaFlowCanvas(props) {
  return (
    <ReactFlowProvider>
      <FlowInner {...props} />
    </ReactFlowProvider>
  );
}
