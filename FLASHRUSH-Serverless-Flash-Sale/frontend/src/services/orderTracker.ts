import { isTerminal, type OrderRecord } from "../types/order";

interface TrackerOptions {
  fetchOrder: () => Promise<OrderRecord>;
  isVisible: () => boolean;
  onOrder: (order: OrderRecord) => void;
  onChecking: (checking: boolean) => void;
  onWaiting: (waiting: boolean) => void;
  onError: (message: string) => void;
}

// Each mounted tracker owns its requests and timer, so late responses cannot affect another order.
export function createOrderTracker(options: TrackerOptions) {
  let stopped = false;
  let inFlight = false;
  let terminal = false;
  let failures = 0;
  let started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function check() {
    if (stopped || inFlight) return;
    if (Date.now() - started >= 60000) {
      options.onWaiting(true);
      return;
    }
    if (!options.isVisible()) {
      schedule();
      return;
    }
    inFlight = true;
    options.onChecking(true);
    try {
      const order = await options.fetchOrder();
      if (stopped) return;
      failures = 0;
      terminal = isTerminal(order.status);
      options.onError("");
      options.onOrder(order);
    } catch {
      if (stopped) return;
      failures++;
      options.onError(
        "Không thể cập nhật trạng thái. Thông tin gần nhất được giữ lại; hệ thống sẽ thử lại.",
      );
    } finally {
      inFlight = false;
      if (!stopped) {
        options.onChecking(false);
        if (!terminal) schedule();
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!stopped)
      timer = setTimeout(
        () => void check(),
        Math.min(16000, 2000 * 2 ** Math.min(failures, 3)),
      );
  }
  return {
    start() {
      void check();
    },
    refresh() {
      if (stopped || inFlight) return;
      clearTimeout(timer);
      started = Date.now();
      options.onWaiting(false);
      void check();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
