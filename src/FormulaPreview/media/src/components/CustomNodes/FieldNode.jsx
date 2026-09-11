import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

const FieldNode = ({ data, selected }) => {
  const isInput = data.isInput;
  const isJustUpdated = data.isJustUpdated;
  const isDimmed = Boolean(data.dimmed);

  return (
    <div
      className={`field-flow-node ${isInput ? 'input-node' : 'computed-node'} ${selected ? 'selected' : ''} ${isJustUpdated ? 'just-updated' : ''} ${isDimmed ? 'dimmed' : ''}`}
      style={{ cursor: 'pointer' }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'var(--accent-color)', width: 6, height: 6 }}
      />
      <div className="node-header">
        <span className="node-title">{data.label || data.name}</span>
        <span className={`node-badge ${isInput ? 'input' : 'calc'}`}>
          {isInput ? 'Nhập' : 'Tính'}
        </span>
      </div>
      <div style={{ fontSize: '9px', color: 'var(--vscode-descriptionForeground)' }}>
        {data.name}
      </div>
      <div className="node-val">
        {typeof data.value === 'boolean'
          ? (data.value ? '☑ Tick' : '☐ Tắt')
          : Number(data.value || 0).toLocaleString('vi-VN')}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'var(--accent-color)', width: 6, height: 6 }}
      />
    </div>
  );
};

export default memo(FieldNode);
