import { useState } from 'react';
import { X } from 'lucide-react';
const information: Record<string, string> = {
  'Điều khoản': 'FLASHRUSH là bản demo phục vụ học tập. Không có giao dịch, thanh toán hoặc giao hàng thực tế.',
  'Bảo mật': 'Bản demo không yêu cầu tài khoản và không gửi thông tin đặt hàng tới backend. Thời gian phiên sale được lưu trong sessionStorage của trình duyệt.',
  'Trung tâm trợ giúp': 'Tìm kiếm hoặc lọc sản phẩm, mở trang chi tiết và chọn số lượng để xem điểm bàn giao Checkout. Tồn kho và giá đều là dữ liệu mô phỏng.',
  'Liên hệ': 'Dự án FLASHRUSH — Serverless Flash Sale System on AWS. Thông tin liên hệ của nhóm sẽ được bổ sung khi triển khai chính thức.',
};
export function Footer() {
  const [info, setInfo] = useState('');
  return <footer className="site-footer"><div className="container footer-inner"><p>© 2026 FLASHRUSH — Hệ thống mô phỏng Flash Sale trên AWS.</p><nav aria-label="Thông tin">{Object.keys(information).map(label => <button key={label} onClick={() => setInfo(info === label ? '' : label)} aria-expanded={info === label}>{label}</button>)}</nav></div>{info && <section className="container footer-info" aria-label={info}><div><strong>{info}</strong><p>{information[info]}</p></div><button aria-label="Đóng thông tin" onClick={() => setInfo('')}><X size={18} /></button></section>}</footer>;
}
