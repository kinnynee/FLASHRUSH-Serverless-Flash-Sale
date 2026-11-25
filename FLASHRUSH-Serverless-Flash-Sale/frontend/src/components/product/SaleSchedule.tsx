import type { Campaign } from '../../types/campaign';
import { saleTime } from '../../utils/storefront';

const labels = { ACTIVE: 'Đang diễn ra', UPCOMING: 'Sắp mở bán', ENDED: 'Đã kết thúc' };
export function SaleSchedule({ campaigns, selectedId, onSelect }: {
  campaigns: Campaign[]; selectedId: string; onSelect: (id: string) => void;
}) {
  if (!campaigns.length) return null;
  return <nav className="sale-timeline" aria-label="Khung giờ Đợt Flash Sale">
    <button className={!selectedId ? 'selected' : ''} aria-pressed={!selectedId} onClick={() => onSelect('')}><strong>Tất cả khung giờ</strong><small>{campaigns.length} đợt Flash Sale</small></button>
    {[...campaigns].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)).map(campaign => <button key={campaign.campaignId} className={selectedId === campaign.campaignId ? 'selected' : ''} aria-pressed={selectedId === campaign.campaignId} onClick={() => onSelect(campaign.campaignId)}>
      <strong>{saleTime(campaign.saleStartsAt || campaign.startTime)}</strong>
      <span>{campaign.name}</span><small>{labels[campaign.status]} · đến {saleTime(campaign.saleEndsAt || campaign.endTime)}</small>
    </button>)}
  </nav>;
}
