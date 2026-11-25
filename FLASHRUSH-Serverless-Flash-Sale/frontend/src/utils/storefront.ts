import type { Campaign } from '../types/campaign';
import type { Product } from '../types/product';
import { normalize } from './product';

export function catalogCategories(products: Product[]) {
  const labels = new Map<string, string>();
  for (const { category } of products) {
    const label = category.trim().replace(/\s+/g, ' ');
    const key = normalize(label);
    const previous = labels.get(key);
    // Prefer the accented label when the API contains spelling variants.
    if (key && (!previous || (label.normalize('NFD') !== label && previous.normalize('NFD') === previous))) labels.set(key, label);
  }
  return [...labels.values()].sort((a, b) => a.localeCompare(b, 'vi'));
}

export function saleStatus(campaign: Campaign, now: number): Campaign['status'] {
  const start = Date.parse(campaign.saleStartsAt || campaign.startTime);
  const end = Date.parse(campaign.saleEndsAt || campaign.endTime);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return campaign.status;
  return now < start ? 'UPCOMING' : now >= end ? 'ENDED' : 'ACTIVE';
}

export function saleDeadline(campaigns: Campaign[], now: number) {
  const active = campaigns.filter(c => saleStatus(c, now) === 'ACTIVE');
  const upcoming = campaigns.filter(c => saleStatus(c, now) === 'UPCOMING');
  const opening = !active.length;
  const target = (opening ? upcoming : active)
    .map(c => opening ? c.saleStartsAt || c.startTime : c.saleEndsAt || c.endTime)
    .filter(t => Number.isFinite(Date.parse(t)))
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return target ? { target, label: opening ? 'Mở bán trong:' : 'Kết thúc trong:' } : undefined;
}

export function saleTime(value: string) {
  return Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : 'Chưa có lịch';
}
