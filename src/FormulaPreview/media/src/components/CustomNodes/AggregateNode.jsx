import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const AggregateNode = ({ data, selected }) => {
  const hasFilter = Boolean(data.filter);
  const isActive = data.isActive !== false;
  const isDimmed = Boolean(data.dimmed);

  let nodeOpacity = 1;
  if (isDimmed) {
    nodeOpacity = 0.28;
  } else if (!isActive) {
    nodeOpacity = 0.45;
  }

  return (
    <div
      className={`aggregate-flow-node ${selected ? 'selected' : ''} ${hasFilter ? 'has-filter' : ''} ${isDimmed ? 'dimmed' : ''}`}
      style={{
        opacity: nodeOpacity,
        borderStyle: hasFilter ? 'dashed' : 'solid',
        borderColor: hasFilter ? (isActive ? '#ba55d3' : 'rgba(186, 85, 211, 0.4)') : '#ba55d3'
      }}
      title={data.plain_vi || data.filter || ''}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#ba55d3', width: 6, height: 6 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        <strong>{hasFilter ? 'Σ Có điều kiện' : 'Σ Cộng dồn'}</strong>
        {hasFilter && (
          <span className={`node-badge ${isActive ? 'calc' : 'input'}`} style={{ fontSize: '8px', padding: '1px 3px' }}>
            {isActive ? 'ĐK: ĐÚNG' : 'ĐK: SAI'}
          </span>
        )}
      </div>

      <div style={{ fontSize: '10px', marginTop: '3px', color: 'var(--app-fg)' }}>
        → <code>{data.master || data.masterName || data.name}</code>
      </div>

      {data.filter_vi && (
        <div className="agg-filter-condition" style={{ fontSize: '9px', marginTop: '3px', color: '#ffd700', fontStyle: 'italic' }}>
          {data.filter_vi}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#ba55d3', width: 6, height: 6 }}
      />
    </div>
  );
};

export default memo(AggregateNode);
