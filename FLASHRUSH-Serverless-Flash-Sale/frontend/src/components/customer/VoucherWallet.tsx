import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TicketPercent, Check, Bookmark, Sparkles } from 'lucide-react';
import { customerService, customerMessage, type VoucherCatalog, type VoucherSelection } from '../../services/customerService';
import { formatPrice } from '../../utils/product';

type Props = { selection?: VoucherSelection; appliedCode?: string; disabled?: boolean; onApply?: (code: string) => void };

export function VoucherWallet(props: Props) {
  return <WalletContent key={JSON.stringify(props.selection) || 'wallet'} {...props} />;
}

function WalletContent({ selection, appliedCode, disabled, onApply }: Props) {
  const [catalog, setCatalog] = useState<VoucherCatalog>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const selectionKey = JSON.stringify(selection);
  useEffect(() => {
    let active = true;
    customerService.vouchers(selectionKey ? JSON.parse(selectionKey) : undefined)
      .then(data => { if (active) { setCatalog(data); setError(''); } })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [selectionKey, revision]);
  async function save(code: string) {
    setSaving(code); setError(''); setNotice('');
    try {
      await customerService.saveVoucher(code);
      setCatalog(previous => previous && { ...previous, items: previous.items.map(item => item.code === code ? { ...item, saved: true } : item) });
      setNotice(`Đã lưu ${code} vào kho voucher của bạn.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể lưu mã.'); }
    finally { setSaving(''); }
  }
  const shown = catalog?.items.filter(item => !savedOnly || item.saved) || [];
  return <div className="voucher-wallet">
    <div className="voucher-wallet-toolbar"><div className="voucher-tabs" aria-label="Lọc voucher">
      <button type="button" aria-pressed={!savedOnly} onClick={() => setSavedOnly(false)}>Tất cả mã</button>
      <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(true)}>Đã lưu ({catalog?.items.filter(item => item.saved).length || 0})</button>
    </div><button type="button" className="text-link" disabled={!!saving} onClick={() => { setCatalog(undefined); setError(''); setRevision(value => value + 1); }}>Làm mới</button></div>
    <p className="customer-muted">Một mã cho mỗi lần mua · Mỗi tài khoản dùng một lần/mã. Lưu mã không giữ lượt sử dụng.</p>
    {notice && <p role="status" className="voucher-success">{notice}</p>}
    {error && <p role="alert" className="order-error">{error}</p>}
    {!catalog && !error && <p role="status">Đang tìm ưu đãi cho bạn…</p>}
    {catalog && !shown.length && <p className="voucher-empty">{savedOnly ? 'Bạn chưa lưu mã nào còn hiệu lực. Khám phá ưu đãi ở mục Tất cả mã.' : 'Chưa có voucher đang phát hành. Hãy quay lại sau.'}</p>}
    <div className="voucher-grid">{shown.map(item => {
      const best = item.code === catalog?.bestCode;
      const selected = item.code === appliedCode;
      const reason = item.reason === 'VOUCHER_MIN_SPEND' ? `Mua thêm ${formatPrice(item.missingSpend)} để dùng mã này.` : item.reason ? customerMessage(item.reason) : '';
      return <article key={item.code} className={`voucher-ticket${selected ? ' is-selected' : ''}`}>
        <div className="voucher-ticket-value"><TicketPercent size={26} /><strong title={item.type === 'fixed' ? formatPrice(item.value) : undefined}>{item.type === 'percent' ? `${item.value}%` : item.value >= 1000 ? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(item.value / 1000)}K` : formatPrice(item.value)}</strong><span>GIẢM GIÁ</span></div>
        <div className="voucher-ticket-body">
          {best && <span className="voucher-best"><Sparkles size={13} /> Giảm nhiều nhất cho đơn này</span>}
          <strong className="voucher-code">{item.code}</strong>
          <p>{item.type === 'fixed' && `Giảm ${formatPrice(item.value)} · `}Đơn từ {formatPrice(item.minSpend)}{item.maxDiscount > 0 && ` · Giảm tối đa ${formatPrice(item.maxDiscount)}`}</p>
          <small>Áp dụng cho các sản phẩm Flash Sale trong giỏ.</small>
          <small>{item.reason === 'VOUCHER_NOT_STARTED' ? `Bắt đầu ${new Date(item.startsAt).toLocaleString('vi-VN')}` : `HSD ${new Date(item.endsAt).toLocaleString('vi-VN')}`} · Còn {item.remaining} lượt</small>
          {item.eligible && <p className="voucher-success">Bạn tiết kiệm {formatPrice(item.discount)}</p>}
          {reason && <p className="voucher-reason">{reason}</p>}
          <div className="voucher-ticket-actions">
            <button type="button" className="text-link" disabled={item.saved || !!saving || disabled || ['VOUCHER_ALREADY_USED', 'VOUCHER_EXHAUSTED'].includes(item.reason || '')} onClick={() => void save(item.code)}>
              {item.saved ? <Check size={14} /> : <Bookmark size={14} />}{item.saved ? 'Đã lưu' : saving === item.code ? 'Đang lưu…' : 'Lưu mã'}
            </button>
            {onApply ? <button type="button" className="button button-primary" disabled={disabled || !item.eligible || selected} onClick={() => onApply(item.code)}>{selected ? 'Đang chọn' : best ? 'Dùng mã tốt nhất' : 'Áp dụng'}</button> : <Link className="text-link" to="/cart">Dùng trong giỏ hàng</Link>}
          </div>
        </div>
      </article>;
    })}</div>
  </div>;
}
