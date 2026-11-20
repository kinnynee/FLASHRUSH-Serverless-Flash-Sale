import { useState } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
const information: Record<string, string> = {
  'Điều khoản': 'FLASHRUSH là nền tảng Flash Sale tốc độ cao trên AWS.',
  'Bảo mật': 'Thông tin đơn hàng được bảo mật trong phiên truy cập của bạn.',
  'Trung tâm trợ giúp': 'Chọn sản phẩm và số lượng để gửi yêu cầu đặt hàng.',
  'Liên hệ': 'Dự án FLASHRUSH — Serverless Flash Sale System on AWS.',
};
export function Footer() {
  const [info, setInfo] = useState('');
  return <footer className="site-footer"><div className="container footer-inner"><nav aria-label="Thông tin">{Object.keys(information).map(label => <button key={label} onClick={() => setInfo(info === label ? '' : label)} aria-expanded={info === label}>{label}</button>)}<Link to="/admin">Quản trị hệ thống</Link></nav></div>{info && <section className="container footer-info" aria-label={info}><div><strong>{info}</strong><p>{information[info]}</p></div><button aria-label="Đóng thông tin" onClick={() => setInfo('')}><X size={18} /></button></section>}</footer>;
}
