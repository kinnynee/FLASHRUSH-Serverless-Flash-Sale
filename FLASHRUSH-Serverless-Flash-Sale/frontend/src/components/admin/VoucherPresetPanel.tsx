import { formatPrice } from '../../utils/product';

export type VoucherDraft = { code: string; type: 'percent' | 'fixed'; value: number; minSpend: number; maxDiscount: number; usageLimit: number; startsAt: string; endsAt: string; enabled: boolean };
type Props = { presets: VoucherDraft[]; existing: string[]; busy: boolean; onPick: (draft: VoucherDraft) => void; onCreateAll: () => void };

export function VoucherPresetPanel({ presets, existing, busy, onPick, onCreateAll }: Props) {
  if (!presets.length) return null;
  return <section className="dash-card voucher-presets"><div className="dash-section-heading"><div><h2>Bộ mã giảm giá</h2><p>Hiệu lực 30 ngày từ lúc tải mẫu. Kiểm tra điều kiện trước khi phát hành.</p></div><button className="button button-primary" disabled={busy || presets.every(item => existing.includes(item.code))} onClick={onCreateAll}>Phát hành các mã còn thiếu</button></div><div className="voucher-presets-grid">{presets.map(item => <article key={item.code}><strong>{item.code}</strong><span>Giảm {item.type === 'percent' ? `${item.value}%` : formatPrice(item.value)}</span><small>Đơn từ {formatPrice(item.minSpend)}{item.maxDiscount > 0 && ` · Tối đa ${formatPrice(item.maxDiscount)}`}</small><small>{item.usageLimit} lượt · 1 lượt/tài khoản</small><button className="button button-secondary" disabled={busy || existing.includes(item.code)} onClick={() => onPick(item)}>{existing.includes(item.code) ? 'Đã có mã này' : 'Tùy chỉnh mẫu'}</button></article>)}</div></section>;
}
