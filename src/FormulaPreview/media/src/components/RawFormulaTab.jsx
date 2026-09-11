import React, { useMemo, memo } from 'react';

const RawFormulaTab = ({ model, onCopy }) => {
  const entries = model.entries || [];

  const rawGaBlock = useMemo(() => {
    const lines = entries.map(e => `  ${e.alias}: ${e.raw}`);
    return `g.$a = {\n${lines.join(',\n')}\n};`;
  }, [entries]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          Khối khai báo <code>g.$a</code> đã làm phẳng (flatten entities):
        </span>
        <button
          className="btn btn-secondary"
          onClick={() => onCopy && onCopy(rawGaBlock)}
          title="Sao chép toàn bộ khối g.$a"
        >
          Sao chép g.$a
        </button>
      </div>

      <pre style={{
        background: 'rgba(0,0,0,0.3)',
        padding: '12px',
        borderRadius: '4px',
        border: '1px solid var(--border-color)',
        overflowX: 'auto',
        fontSize: '11px',
        color: '#d4d4d4',
        fontFamily: 'Consolas, monospace'
      }}>
        {rawGaBlock}
      </pre>
    </div>
  );
};

export default memo(RawFormulaTab);
