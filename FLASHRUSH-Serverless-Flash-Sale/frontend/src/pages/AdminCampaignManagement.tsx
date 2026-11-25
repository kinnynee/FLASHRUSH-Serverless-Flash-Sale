import { useState, type FormEvent } from 'react';
import { campaignService } from '../services/campaignService';
import { useCampaigns } from '../hooks/useCampaigns';
import { useProducts } from '../hooks/useProducts';
import type { Campaign, CampaignInput, CampaignStatus } from '../types/campaign';

const statusLabels: Record<CampaignStatus, string> = {
  ACTIVE: 'Đang diễn ra',
  UPCOMING: 'Sắp diễn ra',
  ENDED: 'Đã kết thúc',
};
const localInputTime = (value: string) => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const emptyForm = () => ({
  name: '',
  startTime: localInputTime(new Date(Date.now() + 86400000).toISOString()),
  endTime: localInputTime(new Date(Date.now() + 27 * 3600000).toISOString()),
  productIds: [] as string[],
  maxQtyPerOrder: '1',
});

export function AdminCampaignManagement() {
  const { campaigns, loading, error, retry, setCampaigns } = useCampaigns();
  const { products, loading: productsLoading, error: productsError } = useProducts();
  const [editing, setEditing] = useState<string>();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');

  function edit(campaign?: Campaign) {
    setEditing(campaign?.campaignId);
    setFormOpen(true);
    setForm(campaign ? {
      name: campaign.name,
      startTime: localInputTime(campaign.startTime),
      endTime: localInputTime(campaign.endTime),
      productIds: campaign.productIds,
      maxQtyPerOrder: String(campaign.maxQtyPerOrder),
    } : emptyForm());
    setMessage('');
    setFailure('');
  }
  function toggleProduct(productId: string) {
    setForm(current => ({
      ...current,
      productIds: current.productIds.includes(productId)
        ? current.productIds.filter(id => id !== productId)
        : [...current.productIds, productId],
    }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setFailure('');
    try {
      const input: CampaignInput = {
        name: form.name.trim(),
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
        productIds: form.productIds,
        maxQtyPerOrder: Number(form.maxQtyPerOrder),
      };
      const saved = editing
        ? await campaignService.updateCampaign(editing, input)
        : await campaignService.createCampaign(input);
      setCampaigns(current => [...current.filter(campaign => campaign.campaignId !== saved.campaignId), saved]);
      setMessage(editing ? 'Đã cập nhật chiến dịch.' : 'Đã tạo chiến dịch.');
      setEditing(undefined);
      setFormOpen(false);
      setForm(emptyForm());
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'Không thể lưu chiến dịch.');
    } finally {
      setSaving(false);
    }
  }
  return <section className="dash-stack" aria-labelledby="campaigns-title">
    <div className="dash-card dash-table-card">
      <div className="dash-section-heading"><div><h2 id="campaigns-title">Chiến dịch Flash Sale</h2><p>Tạo chiến dịch, chỉnh sửa thời gian và chọn sản phẩm.</p></div><button className="button button-primary" type="button" onClick={() => edit()}>Tạo chiến dịch</button></div>
      {error && <p className="campaign-error" role="alert">{error} <button type="button" onClick={retry}>Tải lại</button></p>}
      {loading ? <p>Đang tải chiến dịch...</p> : campaigns.length > 0 ? <div className="dash-scroll-table"><table><thead><tr><th>Tên chiến dịch</th><th>Trạng thái</th><th>Thời gian</th><th>Sản phẩm</th><th>Tối đa / đơn</th><th></th></tr></thead><tbody>{campaigns.map(campaign => <tr key={campaign.campaignId}><th>{campaign.name}<small>{campaign.campaignId}</small></th><td>{statusLabels[campaign.status]}</td><td><time>{new Date(campaign.startTime).toLocaleString('vi-VN')}</time><small>đến {new Date(campaign.endTime).toLocaleString('vi-VN')}</small></td><td>{campaign.productIds.length}</td><td>{campaign.maxQtyPerOrder}</td><td><button className="dash-text-link" type="button" onClick={() => edit(campaign)}>Chỉnh sửa</button></td></tr>)}</tbody></table></div> : <p>Chưa có chiến dịch nào. Tạo chiến dịch đầu tiên để bắt đầu.</p>}
    </div>
    {formOpen && <form className="dash-card campaign-form" onSubmit={submit}>
      <div className="dash-section-heading"><div><h2>{editing ? 'Chỉnh sửa chiến dịch' : 'Tạo chiến dịch mới'}</h2><p>Thời gian bắt đầu và kết thúc sử dụng múi giờ địa phương của thiết bị.</p></div><button className="button button-secondary" type="button" onClick={() => { setEditing(undefined); setFormOpen(false); setForm(emptyForm()); }}>Đóng</button></div>
      <label>Tên chiến dịch<input required maxLength={160} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
      <div className="campaign-form-grid"><label>Bắt đầu<input required type="datetime-local" value={form.startTime} onChange={event => setForm(current => ({ ...current, startTime: event.target.value }))} /></label><label>Kết thúc<input required type="datetime-local" min={form.startTime} value={form.endTime} onChange={event => setForm(current => ({ ...current, endTime: event.target.value }))} /></label><label>Số lượng tối đa mỗi đơn<input required type="number" min="1" step="1" value={form.maxQtyPerOrder} onChange={event => setForm(current => ({ ...current, maxQtyPerOrder: event.target.value }))} /></label></div>
      <fieldset className="campaign-products"><legend>Sản phẩm trong chiến dịch</legend>{productsError && <p className="campaign-error" role="alert">{productsError}</p>}{productsLoading ? <p>Đang tải sản phẩm...</p> : <div>{products.map(product => <label key={product.productId}><input type="checkbox" checked={form.productIds.includes(product.productId)} onChange={() => toggleProduct(product.productId)} />{product.name}</label>)}</div>}</fieldset>
      {message && <p role="status">{message}</p>}{failure && <p className="campaign-error" role="alert">{failure}</p>}
      <button className="button button-primary" type="submit" disabled={saving || productsLoading || !form.productIds.length}>{saving ? 'Đang lưu...' : 'Lưu chiến dịch'}</button>
    </form>}
  </section>;
}
