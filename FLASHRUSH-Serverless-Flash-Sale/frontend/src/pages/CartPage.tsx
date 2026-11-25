import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { LoadingSkeleton } from '../components/common/LoadingSkeleton';
import { ProductImage } from '../components/common/ProductImage';
import { QuantitySelector } from '../components/product/QuantitySelector';
import { useCart } from '../contexts/CartContext';
import { cartSubtotal, totalQuantity } from '../services/cartStorage';
import { loadCheckoutCatalog, quoteSelections, type CheckoutCatalog } from '../services/checkoutCatalog';
import { formatPrice } from '../utils/product';

export function CartPage() {
  const cart = useCart();
  const productIds = JSON.stringify(cart.items.map(item => item.productId));
  const [catalog, setCatalog] = useState<{ ids: string; value?: CheckoutCatalog; failed?: boolean }>();
  const [attempt, setAttempt] = useState(0);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    const ids: string[] = JSON.parse(productIds);
    if (!ids.length) return;
    let active = true;
    setCatalog(undefined);
    void loadCheckoutCatalog(ids).then(
      value => { if (active) setCatalog({ ids: productIds, value }); },
      () => { if (active) setCatalog({ ids: productIds, failed: true }); },
    );
    return () => { active = false; };
  }, [productIds, attempt]);

  function change(action: () => void) {
    setActionError('');
    try { action(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Không thể cập nhật giỏ hàng.'); }
  }

  if (cart.storageError) return <div className="container page-state"><EmptyState error title="Không thể mở giỏ hàng" description={cart.storageError} /></div>;
  if (!cart.items.length) return <div className="container page-state">
    <EmptyState title="Giỏ hàng đang trống" description="Khám phá ưu đãi và thêm sản phẩm vào giỏ hàng.">
      <Link className="button button-primary" to="/products">Tiếp tục mua sắm</Link>
    </EmptyState>
  </div>;

  const current = catalog?.ids === productIds ? catalog : undefined;
  const lines = current?.value ? quoteSelections(cart.items, current.value) : undefined;
  const canCheckout = !!lines?.every(line => !line.issue);
  const subtotal = lines ? lines.reduce((sum, line) => sum + (line.item.subtotal ?? 0), 0) : cartSubtotal(cart.items);

  return <div className="container order-checkout cart-page">
    <h1>Giỏ hàng</h1>
    <div className="checkout-grid">
      <section className="order-panel">
        <div className="cart-heading">
          <h2>Sản phẩm trong giỏ</h2>
          <Button variant="secondary" onClick={() => change(cart.clearCart)}>Xóa tất cả</Button>
        </div>
        {!current && <LoadingSkeleton count={1} />}
        {current?.failed && <div className="order-error" role="alert">
          Không thể cập nhật giá và tồn kho. <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>Thử lại</Button>
        </div>}
        {actionError && <p className="order-error" role="alert">{actionError}</p>}
        <ul className="cart-lines">
          {cart.items.map((saved, index) => {
            const line = lines?.[index];
            const item = line?.item ?? saved;
            const limit = line?.limit ?? 0;
            const unitPrice = item.unitPrice ?? saved.unitPrice;
            return <li key={item.productId} className="cart-line">
              <div className="order-product">
                <ProductImage src={item.image ?? ''} alt="" />
                <div>
                  <Link to={`/products/${encodeURIComponent(item.productId)}`}><strong>{item.name}</strong></Link>
                  {item.selectedColor && <p>Màu {item.selectedColor}</p>}
                  <p>{formatPrice(unitPrice)} / sản phẩm</p>
                  {line?.stock !== undefined && <p>Còn {line.stock} sản phẩm</p>}
                  {line?.priceChanged && <p className="order-notice" role="status">Giá đã đổi từ {formatPrice(saved.unitPrice)} sang {formatPrice(unitPrice)}.</p>}
                  {line?.issue && <p className="order-error" role="status">{line.issue}</p>}
                </div>
              </div>
              <div className="cart-line-actions">
                <span>Số lượng {item.quantity}</span>
                {limit > 0 && <QuantitySelector value={item.quantity} stock={limit}
                  onChange={quantity => change(() => cart.updateQuantity(item.productId, quantity, limit))} />}
                <strong>{formatPrice(unitPrice * item.quantity)}</strong>
                <Button variant="secondary" aria-label={`Xóa ${item.name} khỏi giỏ`}
                  onClick={() => change(() => cart.removeItem(item.productId))}><Trash2 size={16} /> Xóa</Button>
              </div>
            </li>;
          })}
        </ul>
      </section>
      <section className="order-panel checkout-total">
        <h2>Tóm tắt giỏ hàng</h2>
        <div className="order-summary-head"><span>Tổng số lượng</span><strong>{totalQuantity(cart.items)}</strong></div>
        <div className="order-summary-head"><span>Tạm tính</span><strong className="order-price">{formatPrice(subtotal)}</strong></div>
        {canCheckout ? <Link className="button button-primary order-full-button" to="/checkout?source=cart">Tiến hành đặt hàng</Link> :
          <Button className="order-full-button" disabled>Tiến hành đặt hàng</Button>}
        <Link className="text-link" to="/products">Tiếp tục mua sắm</Link>
      </section>
    </div>
  </div>;
}
