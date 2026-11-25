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
    <section className="dash-card dash-admin-key-card" aria-labelledby="dash-admin-key-title">
      <div>
        <h2 id="dash-admin-key-title">Kết nối dữ liệu AWS</h2>
        <p>{connected ? 'Admin API key đã được lưu trong phiên trình duyệt.' : 'Nhập Admin API key để đọc số liệu CloudWatch.'}</p>
      </div>
      <form className="dash-admin-auth" onSubmit={connect}>
        <label className="sr-only" htmlFor="admin-api-key">Admin API key</label>
        <input id="admin-api-key" type="password" autoComplete="current-password" value={key}
          onChange={event => setKey(event.target.value)} placeholder="Admin API key" />
        <Button type="submit" disabled={!key.trim()}>Kết nối</Button>
        {connected && <Button type="button" variant="secondary" onClick={disconnect}>Ngắt kết nối</Button>}
      </form>
    </section>
  );
}
