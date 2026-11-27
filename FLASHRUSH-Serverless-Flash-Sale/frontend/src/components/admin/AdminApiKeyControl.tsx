import { useState, type FormEvent } from 'react';
import { Button } from '../common/Button';
import { getAdminKey, setAdminKey } from '../../services/adminAuth';

export function AdminApiKeyControl({ onChange }: { onChange: () => void }) {
  const [key, setKey] = useState('');
  const [connected, setConnected] = useState(() => !!getAdminKey());

  function connect(event: FormEvent) {
    event.preventDefault();
    const value = key.trim();
    if (!value) return;
    setAdminKey(value);
    setConnected(true);
    setKey('');
    onChange();
  }

  function disconnect() {
    setAdminKey('');
    setConnected(false);
    setKey('');
    onChange();
  }

  return (
    <details className="monitoring-connection">
      <summary><span className={`connection-dot ${connected ? 'is-connected' : ''}`} />Kết nối API<span className="connection-state">{connected ? 'Đã lưu khóa' : 'Thiết lập'}</span></summary>
      <form className="dash-admin-auth" onSubmit={connect}>
        <label className="sr-only" htmlFor="admin-api-key">Admin API key</label>
        <input id="admin-api-key" type="password" autoComplete="off" value={key}
          onChange={event => setKey(event.target.value)} placeholder="Admin API key" />
        <Button type="submit" disabled={!key.trim()}>Kết nối</Button>
        {connected && <Button type="button" variant="secondary" onClick={disconnect}>Ngắt kết nối</Button>}
      </form>
    </details>
  );
}
