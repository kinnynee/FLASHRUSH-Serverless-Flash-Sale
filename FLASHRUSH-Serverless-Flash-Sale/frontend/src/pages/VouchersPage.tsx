import { TicketPercent } from 'lucide-react';
import { VoucherWallet } from '../components/customer/VoucherWallet';
import { CustomerGate } from './CustomerAuthPage';

export function VouchersPage() {
  return <CustomerGate><div className="container vouchers-page"><div className="section-heading"><div><span className="section-kicker">ƯU ĐÃI DÀNH CHO BẠN</span><h1><TicketPercent /> Kho voucher</h1><p>Lưu ưu đãi yêu thích. Chọn mã phù hợp khi thanh toán.</p></div></div><section className="customer-panel"><VoucherWallet /></section></div></CustomerGate>;
}
