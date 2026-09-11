import React, { memo } from 'react';
import { GROUP_TITLES } from '../utils/groupConstants';

const GroupTab = ({ model }) => {
  const entries = model.entries || [];
  const groups = model.groups || ['qty_price', 'amount', 'discount', 'tax', 'fee', 'master', 'other'];

  const entriesByGroup = {};
  groups.forEach(g => { entriesByGroup[g] = []; });

  entries.forEach(e => {
    const grp = e.group || 'other';
    if (!entriesByGroup[grp]) entriesByGroup[grp] = [];
    entriesByGroup[grp].push(e);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ color: 'var(--vscode-descriptionForeground)', fontSize: '11px' }}>
        Các công thức tính toán trong khối <code>g.$a</code> được phân nhóm theo nghiệp vụ:
      </div>

      {groups.map(grpKey => {
        const list = entriesByGroup[grpKey] || [];
        if (list.length === 0) return null;

        return (
          <div
            key={grpKey}
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '10px 14px',
              background: 'rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '12px', marginBottom: '8px', color: 'var(--accent-color)' }}>
              {GROUP_TITLES[grpKey] || grpKey} ({list.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '8px' }}>
              {list.map((e, idx) => (
                <div key={idx} style={{ fontSize: '11px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                  <code style={{ color: '#4fc1ff', minWidth: '120px' }}>{e.alias}</code>
                  <span style={{ color: 'var(--vscode-descriptionForeground)' }}>→</span>
                  <span style={{ color: 'var(--vscode-editor-foreground)', flex: 1 }}>{e.plain_vi}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default memo(GroupTab);
