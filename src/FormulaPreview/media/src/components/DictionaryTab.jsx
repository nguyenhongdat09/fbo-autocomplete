import React, { useState, useMemo, memo } from 'react';

const DictionaryTab = ({ model }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const entries = model.entries || [];

  const targetToAliases = useMemo(() => {
    const map = new Map();
    entries.forEach(e => {
      if (e.target) {
        if (!map.has(e.target)) map.set(e.target, []);
        map.get(e.target).push(e.alias);
      }
    });
    return map;
  }, [entries]);

  const defaultChainSet = useMemo(() => new Set(model.default_demo_chain || []), [model.default_demo_chain]);

  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const term = searchTerm.toLowerCase();
    return entries.filter(e =>
      e.alias.toLowerCase().includes(term) ||
      (e.target && e.target.toLowerCase().includes(term)) ||
      (e.plain_vi && e.plain_vi.toLowerCase().includes(term)) ||
      (e.raw && e.raw.toLowerCase().includes(term))
    );
  }, [entries, searchTerm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="text"
          className="field-input"
          style={{ width: '250px', textAlign: 'left' }}
          placeholder="Lọc alias, tên cột, diễn giải..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
          {filteredEntries.length}/{entries.length} mục
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="dict-table">
          <thead>
            <tr>
              <th>Alias (Mã bí danh)</th>
              <th>Loại</th>
              <th>Cột đích</th>
              <th>Diễn giải tiếng Việt</th>
              <th>Biểu thức gốc (Raw)</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e, idx) => (
              <tr key={idx}>
                <td>
                  <code>{e.alias}</code>
                  {e.kind === 'formula' && !defaultChainSet.has(e.alias) && (
                    <span
                      className="node-badge"
                      style={{
                        marginLeft: '6px',
                        fontSize: '8px',
                        padding: '1px 4px',
                        opacity: 0.8,
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--vscode-descriptionForeground)'
                      }}
                      title="Nhánh phụ (không chạy trong chuỗi demo mặc định)"
                    >
                      Nhánh phụ
                    </span>
                  )}
                </td>
                <td>
                  <span className={`node-badge ${e.kind === 'formula' ? 'calc' : 'input'}`}>
                    {e.kind}
                  </span>
                </td>
                <td>
                  {e.target ? (
                    <div>
                      <code>{e.target}</code>
                      {targetToAliases.get(e.target)?.length > 1 && (
                        <div style={{ fontSize: '9px', color: 'var(--vscode-descriptionForeground)', marginTop: '2px' }}>
                          (cùng ghi {e.target}: {targetToAliases.get(e.target).join(', ')})
                        </div>
                      )}
                    </div>
                  ) : (e.master ? <code>{e.master}</code> : '—')}
                </td>
                <td>{e.plain_vi}</td>
                <td><code style={{ fontSize: '10px' }}>{e.raw}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default memo(DictionaryTab);
