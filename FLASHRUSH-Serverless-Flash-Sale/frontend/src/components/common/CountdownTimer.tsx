import { Clock3 } from 'lucide-react';
import { useCountdown } from '../../hooks/useCountdown';
export interface CountdownTimerProps { target: string; label?: string; }
export function CountdownTimer({ target, label = 'Kết thúc trong:' }: CountdownTimerProps) {
  const seconds = useCountdown(target);
  if (!seconds) return <span className="countdown expired">Phiên Flash Sale đã kết thúc</span>;
  const parts = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  return <div className="countdown" role="timer" aria-label={`${label} ${parts[0]} giờ ${parts[1]} phút ${parts[2]} giây`}><Clock3 size={15} /><span>{label}</span><div className="timer-digits">{parts.map((part, i) => <span className="timer-part" key={i}>{i > 0 && <i>:</i>}<b>{String(part).padStart(2, '0')}</b></span>)}</div></div>;
}
