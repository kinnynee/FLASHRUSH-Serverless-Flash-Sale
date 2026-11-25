import { useCallback, useEffect, useRef, useState } from "react";
import { orderService } from "../services/orderService";
import { getAccess, saveHistory } from "../services/orderStorage";
import { createOrderTracker } from "../services/orderTracker";
import type { OrderRecord } from "../types/order";

export function useOrderPolling(orderId: string) {
  const [order, setOrder] = useState<OrderRecord>();
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [lastChecked, setLastChecked] = useState<number>();
  const tracker = useRef<ReturnType<typeof createOrderTracker> | undefined>(
    undefined,
  );
  const key = getAccess()[orderId];
  useEffect(() => {
    setOrder(undefined);
    setError("");
    setWaiting(false);
    setLastChecked(undefined);
    setChecking(false);
    if (!key) return;
    const current = createOrderTracker({
      fetchOrder: () => orderService.getOrder(orderId, key),
      isVisible: () => !document.hidden,
      onChecking: setChecking,
      onWaiting: setWaiting,
      onError: setError,
      onOrder: (next) => {
        setOrder(next);
        setLastChecked(Date.now());
        try {
          saveHistory(next);
        } catch {
          setError(
            "Trạng thái đã cập nhật nhưng không thể lưu lịch sử trên trình duyệt.",
          );
        }
      },
    });
    tracker.current = current;
    current.start();
    return () => {
      current.stop();
      tracker.current = undefined;
    };
  }, [orderId, key]);
  const refresh = useCallback(() => tracker.current?.refresh(), []);
  return {
    order: order?.orderId === orderId ? order : undefined,
    error,
    checking,
    waiting,
    lastChecked,
    hasAccess: !!key,
    refresh,
  };
}
