import { useEffect, useState } from 'react';
import { remainingSeconds } from '../utils/product';
import { getServerNow } from '../utils/serverClock';

export function countdownSeconds(target: string, clientNow = Date.now()) {
  return remainingSeconds(target, getServerNow(clientNow));
}

export function useCountdown(target: string) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [target]);
  return remainingSeconds(target, getServerNow(now));
}
