import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { currentCustomer, signIn, signOut, type CustomerIdentity } from '../../services/customerAuth';
import { customerService, type Cart, type CartInput } from '../../services/customerService';
import type { Product } from '../../types/product';

function useCustomerState() {
  const [user, setUser] = useState<CustomerIdentity | null>(null);
  const [ready, setReady] = useState(false);
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const owner = useRef<string | null>(null);
  const writing = useRef(false);
  const [busy, setBusy] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  const updateName = (name: string) => setUser(previous => previous ? { ...previous, name } : previous);
  const refreshCart = useCallback(async () => {
    const id = owner.current;
    if (!id) return;
    setLoading(true); setError('');
    try { const result = await customerService.cart(); if (owner.current === id) setCart(previous => !previous || result.version >= previous.version ? result : previous); }
    catch (reason) { if (owner.current === id) setError(reason instanceof Error ? reason.message : 'Không thể tải giỏ hàng.'); }
    finally { if (owner.current === id) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    const expired = () => { owner.current = null; setUser(null); setCart(null); setLoading(false); };
    window.addEventListener('customer-session-expired', expired);
    currentCustomer().then(result => { if (active) { owner.current = result?.sub || null; setUser(result); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Không thể kiểm tra phiên đăng nhập.'); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; window.removeEventListener('customer-session-expired', expired); };
  }, []);
  useEffect(() => { void refreshCart(); }, [user?.sub, refreshCart]);
  useEffect(() => {
    const id = user?.sub;
    if (!id) return;
    let active = true;
    customerService.profile().then(profile => { if (active && owner.current === id && profile.name) setUser(previous => previous ? { ...previous, name: profile.name } : previous); }).catch(() => { /* Profile screens expose retry; identity remains valid. */ });
    return () => { active = false; };
  }, [user?.sub]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); }, [toast]);
  async function login(email: string, password: string) {
    const result = await signIn(email, password);
    owner.current = result?.sub || null; setCart(null); setUser(result); setError('');
  }
  async function logout() {
    owner.current = null; setUser(null); setCart(null);
    try { await signOut(); notify('Đã đăng xuất.'); }
    catch { notify('Đã xóa phiên trên thiết bị. Chưa thể xác nhận đăng xuất các phiên khác do lỗi mạng.'); }
  }
  async function updateCart(items: CartInput[], version = cart?.version) {
    const id = owner.current;
    if (!id || version === undefined) throw new Error('Vui lòng đăng nhập và tải lại giỏ hàng.');
    if (writing.current) throw new Error('Đang cập nhật giỏ hàng, vui lòng chờ.');
    writing.current = true; setBusy(true);
    try {
      const result = await customerService.saveCart(version, items);
      if (owner.current === id) setCart(result);
      return result;
    } finally { writing.current = false; setBusy(false); }
  }
  async function add(product: Product, quantity: number, color: string) {
    const id = owner.current;
    if (!id) throw new Error('Vui lòng đăng nhập để thêm sản phẩm.');
    const fresh = await customerService.cart();
    if (owner.current !== id) throw new Error('Phiên đăng nhập đã thay đổi.');
    const existing = fresh.items.find(line => line.productId === product.productId && line.color === color);
    const next = existing ? fresh.items.map(line => line === existing ? { ...line, quantity: line.quantity + quantity } : line)
      : [...fresh.items, { productId: product.productId, quantity, color, unitPrice: product.price }];
    const result = await updateCart(next, fresh.version);
    notify('Đã thêm sản phẩm vào giỏ. Tồn kho chưa được giữ chỗ.');
    return result.items.find(line => line.productId === product.productId && line.color === color)!;
  }
  return { user, ready, cart, loading, error, busy, toast, notify, login, logout, refreshCart, updateCart, add, updateName };
}
const Context = createContext<ReturnType<typeof useCustomerState> | null>(null);
export function CustomerProvider({ children }: { children: ReactNode }) {
  const state = useCustomerState();
  return <Context.Provider value={state}>{children}{state.toast && <div className="customer-toast" role="status">{state.toast}</div>}</Context.Provider>;
}
export function useCustomer() {
  const context = useContext(Context);
  if (!context) throw new Error('CustomerProvider is required');
  return context;
}
