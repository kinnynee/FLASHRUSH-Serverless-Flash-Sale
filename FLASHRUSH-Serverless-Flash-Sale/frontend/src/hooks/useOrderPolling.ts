import { useCallback, useEffect, useRef, useState } from 'react';
import { orderService } from '../services/orderService';
import { getAccess, saveHistory } from '../services/orderStorage';
import { isTerminal, type OrderRecord } from '../types/order';

export function useOrderPolling(orderId: string) {
  const [order, setOrder] = useState<OrderRecord | undefined>();
  const currentOrder = order?.orderId === orderId ? order : undefined;
  const [error, setError] = useState(''); const [checking, setChecking] = useState(false); const [waiting, setWaiting] = useState(false);
  const active = useRef(false); const inFlight = useRef(false); const generation = useRef(0); const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const failures = useRef(0); const started = useRef(Date.now()); const key = getAccess()[orderId];
  const refresh = useCallback(async () => {
    if (!key || inFlight.current || !active.current) return;
    const requestGeneration = generation.current;
    inFlight.current = true; setChecking(true);
    try { const next = await orderService.getOrder(orderId, key); if (!active.current || generation.current !== requestGeneration) return; setOrder(next); setError(''); failures.current = 0; try { saveHistory(next); } catch { setError('Không thể lưu lịch sử trên trình duyệt.'); } }
    catch { if (active.current && generation.current === requestGeneration) { failures.current++; setError('Không thể kiểm tra trạng thái lúc này. Vui lòng thử lại.'); } }
    finally { inFlight.current = false; if (active.current) setChecking(false); }
  }, [orderId, key]);
  useEffect(() => { generation.current++; active.current = true; setOrder(undefined); setError(''); setWaiting(false); failures.current = 0; started.current = Date.now(); void refresh(); return () => { active.current = false; generation.current++; clearTimeout(timer.current); }; }, [refresh]);
  useEffect(() => {
    if (!key || (currentOrder && isTerminal(currentOrder.status)) || waiting) return;
    let cancelled = false;
    const schedule = () => { if (cancelled) return; clearTimeout(timer.current); timer.current = setTimeout(async () => { if (Date.now() - started.current >= 60000) { setWaiting(true); return; } if (!document.hidden) await refresh(); schedule(); }, Math.min(16000, 2000 * 2 ** Math.min(failures.current, 3))); };
    schedule(); return () => { cancelled = true; clearTimeout(timer.current); };
  }, [key, currentOrder, refresh, waiting]);
  return { order: currentOrder, error, checking, waiting, hasAccess: !!key, refresh };
}
