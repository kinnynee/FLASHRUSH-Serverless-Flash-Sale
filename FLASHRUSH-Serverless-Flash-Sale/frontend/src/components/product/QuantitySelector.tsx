import { Minus, Plus } from 'lucide-react';
import { clampQuantity } from '../../utils/product';
export interface QuantitySelectorProps { value: number; stock: number; onChange(value: number): void; disabled?: boolean; }
export function QuantitySelector({ value, stock, onChange, disabled }: QuantitySelectorProps) {
  if (import.meta.env.VITE_ORDER_MODE === 'http') stock = Math.min(stock, 1);
  return <div className="quantity-control"><button aria-label="Giảm số lượng" disabled={disabled || value <= 1} onClick={() => onChange(clampQuantity(value - 1, stock))}><Minus size={15} /></button><input type="number" inputMode="numeric" aria-label="Số lượng" min={stock ? 1 : 0} max={stock} value={stock ? value : 0} disabled={disabled || stock === 0} onChange={event => onChange(clampQuantity(Number(event.target.value), stock))} /><button aria-label="Tăng số lượng" disabled={disabled || value >= stock} onClick={() => onChange(clampQuantity(value + 1, stock))}><Plus size={15} /></button></div>;
}
