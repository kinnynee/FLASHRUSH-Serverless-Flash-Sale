import type { Product } from '../types/product';

// One target per browser session, shared across routes and reloads. No stock mutation.
const sessionKey = 'flashrush.demo.saleEndsAt.v1';
function demoDeadline() {
  try {
    const saved = sessionStorage.getItem(sessionKey);
    if (saved && Number.isFinite(Date.parse(saved))) return saved;
    const deadline = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    sessionStorage.setItem(sessionKey, deadline);
    return deadline;
  } catch { return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(); }
}
export const saleEndsAt = demoDeadline();
const photo = (name: string) => `/images/${name}.jpg`;
export const products: Product[] = [
  { productId: 'sony-wh-1000xm5', name: 'Tai nghe Bluetooth chống ồn Sony WH-1000XM5', category: 'Tai nghe', price: 4290000, originalPrice: 8490000, stock: 3, initialStock: 50, images: [photo('headphones-black'), photo('headphones'), photo('headphones-white')], description: 'Đắm chìm trong không gian âm nhạc của riêng bạn. Thiết kế chụp tai êm ái, chống ồn chủ động và âm thanh chi tiết, phù hợp khi làm việc, di chuyển hoặc thư giãn.', colors: ['Đen', 'Bạc', 'Xanh đậm'], specs: [{ label: 'THỜI LƯỢNG PIN', value: '30 Giờ', detail: 'Sạc nhanh, nghe lâu hơn' }, { label: 'CÔNG NGHỆ ANC', value: 'Chip V1 + QN1', detail: '8 micro chống ồn' }, { label: 'KẾT NỐI', value: 'Bluetooth 5.2', detail: 'LDAC, AAC, SBC' }, { label: 'BẢO HÀNH', value: '12 Tháng', detail: 'Chính hãng 100%' }], isFlashSale: true, saleEndsAt },
  { productId: 'keychron-k2', name: 'Bàn phím Keychron K2 Không Dây', category: 'Bàn phím', price: 690000, originalPrice: 1990000, stock: 4, initialStock: 50, images: [photo('keyboard')], description: 'Bàn phím cơ gọn gàng cho góc làm việc. Kết nối không dây tiện lợi, cảm giác gõ rõ ràng và thiết kế hiện đại.', isFlashSale: true, saleEndsAt },
  { productId: 'logitech-mx-master-3s', name: 'Chuột Logitech MX Master 3S', category: 'Chuột gaming', price: 1490000, originalPrice: 2690000, stock: 12, initialStock: 48, images: [photo('mouse')], description: 'Chuột không dây với thiết kế công thái học, cuộn mượt và thao tác chính xác cho công việc mỗi ngày.', isFlashSale: true, saleEndsAt },
  { productId: 'apple-watch-series-9', name: 'Apple Watch Series 9', category: 'Phụ kiện công nghệ', price: 6890000, originalPrice: 10590000, stock: 6, initialStock: 50, images: [photo('watch')], description: 'Đồng hồ thông minh với màn hình sắc nét và thiết kế thanh lịch. Đồng hành cùng các hoạt động hằng ngày.', isFlashSale: true, saleEndsAt },
  { productId: 'wireless-earbuds', name: 'Tai nghe không dây Sound Pro', category: 'Tai nghe', price: 890000, originalPrice: 1590000, stock: 5, initialStock: 40, images: [photo('earbuds')], description: 'Tai nghe nhỏ gọn đi cùng hộp sạc, dễ dàng mang theo để nghe nhạc và đàm thoại.', isFlashSale: true, saleEndsAt },
  { productId: 'rgb-keyboard-k88', name: 'Bàn phím cơ RGB K88', category: 'Bàn phím', price: 890000, originalPrice: 1550000, stock: 8, initialStock: 32, images: [photo('keyboard-rgb')], description: 'Bàn phím cơ với ánh sáng RGB nổi bật, phù hợp với không gian chơi game và làm việc.', isFlashSale: true, saleEndsAt },
  { productId: 'iphone-15', name: 'Điện thoại iPhone 15 128GB', category: 'Điện thoại', price: 14990000, originalPrice: 22990000, stock: 7, initialStock: 30, images: [photo('phone')], description: 'Điện thoại thiết kế tinh giản, màn hình rộng và camera linh hoạt cho trải nghiệm hằng ngày.', isFlashSale: true, saleEndsAt },
  { productId: 'macbook-air-m2', name: 'Laptop MacBook Air M2 13 inch', category: 'Laptop', price: 18990000, originalPrice: 27990000, stock: 3, initialStock: 20, images: [photo('laptop')], description: 'Laptop mỏng nhẹ dành cho học tập và làm việc, bàn phím thoải mái và thời lượng sử dụng dài.', isFlashSale: true, saleEndsAt },
  { productId: 'portable-speaker', name: 'Loa Bluetooth Portable Mini', category: 'Phụ kiện công nghệ', price: 490000, originalPrice: 990000, stock: 0, initialStock: 25, images: [photo('speaker')], description: 'Loa Bluetooth gọn nhẹ, dễ mang theo trong những chuyến đi. Sản phẩm đã hết hàng trong đợt mở bán này.', isFlashSale: true, saleEndsAt },
  { productId: 'gaming-mouse-pro', name: 'Chuột Gaming Pro Wireless', category: 'Chuột gaming', price: 590000, originalPrice: 1190000, stock: 9, initialStock: 40, images: [photo('mouse-gaming')], description: 'Chuột gaming không dây với thiết kế nhẹ, phù hợp cho những thao tác nhanh và chính xác.', isFlashSale: true, saleEndsAt },
  { productId: 'headphones-studio', name: 'Tai nghe Studio Wireless màu kem', category: 'Tai nghe', price: 1290000, originalPrice: 2490000, stock: 10, initialStock: 40, images: [photo('headphones-white')], description: 'Tai nghe tông màu trung tính, đệm tai mềm và kiểu dáng tối giản cho mọi không gian.', isFlashSale: true, saleEndsAt },
  { productId: 'laptop-work-pro', name: 'Laptop Work Pro 14 inch', category: 'Laptop', price: 12990000, originalPrice: 19990000, stock: 5, initialStock: 25, images: [photo('laptop-work')], description: 'Laptop cho công việc với màn hình 14 inch và thiết kế tiện di chuyển.', isFlashSale: true, saleEndsAt },
];
export const categories = [...new Set(products.map(product => product.category))];
