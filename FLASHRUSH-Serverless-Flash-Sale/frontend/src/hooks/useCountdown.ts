import { useEffect, useState } from 'react';
import { remainingSeconds } from '../utils/product';

export function useCountdown(target: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [target]);
  return remainingSeconds(target, now);
}
