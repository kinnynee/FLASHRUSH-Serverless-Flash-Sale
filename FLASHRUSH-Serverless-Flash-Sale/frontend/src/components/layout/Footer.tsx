import { useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { useCustomer } from '../customer/CustomerProvider';

const information: Record<string, string> = {
  'Hướng dẫn mua hàng': 'Chọn sản phẩm, kiểm tra số lượng rồi gửi yêu cầu đặt hàng. Theo dõi kết quả xử lý trong mục Đơn hàng của tôi.',
  'Trung tâm trợ giúp': 'Nếu đơn đang xử lý, hãy kiểm tra lại trạng thái trước khi gửi thêm yêu cầu. Giữ mã đơn và phiên trình duyệt để tra cứu kết quả.',
  'Liên hệ': 'FLASHRUSH là dự án thực hành Serverless Flash Sale trên AWS. Kênh liên hệ hỗ trợ đang được cập nhật.',
  'Điều khoản sử dụng': 'FLASHRUSH là dự án mô phỏng phục vụ học tập. Các thao tác đặt hàng dùng để minh họa quy trình Flash Sale, không phát sinh thanh toán hoặc giao hàng thực tế.',
  'Chính sách bảo mật': 'Trình duyệt lưu thông tin phiên và lịch sử đơn để hỗ trợ tra cứu. Không chia sẻ mã truy cập đơn hàng hoặc thông tin đăng nhập của bạn.',
};

export function Footer() {
  const [info, setInfo] = useState('');
  const { user } = useCustomer();
  const ordersPath = user ? '/account/orders' : '/orders';
  const infoButton = (label: string) => <button onClick={() => setInfo(info === label ? '' : label)} aria-expanded={info === label} aria-controls="footer-information">{label}</button>;

  return <footer className="site-footer">
    <div className="container footer-content">
      <div className="footer-columns">
        <div className="footer-brand-column">
          <BrandLogo />
          <p>Công nghệ yêu thích. Ưu đãi mỗi ngày.</p>
        </div>
        <nav className="footer-column" aria-label="Khám phá">
          <h2>Khám phá</h2>
          <Link to="/products?status=ALL">Tất cả sản phẩm</Link>
          <Link to="/products?status=ACTIVE">Flash Sale đang diễn ra</Link>
          <Link to={'/products?status=ALL&category=' + encodeURIComponent('Phụ kiện công nghệ')}>Phụ kiện công nghệ</Link>
          <Link to={ordersPath}>Đơn hàng của tôi</Link>
        </nav>
        <nav className="footer-column" aria-label="Hỗ trợ khách hàng">
          <h2>Hỗ trợ khách hàng</h2>
          {infoButton('Hướng dẫn mua hàng')}
          {infoButton('Trung tâm trợ giúp')}
          {infoButton('Liên hệ')}
        </nav>
      </div>
      {info && <section id="footer-information" className="footer-information" aria-label={info}>
        <div><h2>{info}</h2><p>{information[info]}</p></div>
        <button aria-label="Đóng thông tin" onClick={() => setInfo('')}><X size={18} /></button>
      </section>}
      <div className="footer-bottom">
        <p>© {new Date().getFullYear()} FLASHRUSH · Dự án mô phỏng</p>
        <nav aria-label="Chính sách">
          {infoButton('Điều khoản sử dụng')}
          {infoButton('Chính sách bảo mật')}
        </nav>
      </div>
    </div>
  </footer>;
}
