import type { Campaign } from '../types/campaign';

export function campaignOffer(campaigns: Campaign[], productId: string, now = Date.now()) {
  const active = campaigns.filter(campaign => campaign.productIds.includes(productId) &&
    Date.parse(campaign.startTime) <= now && Date.parse(campaign.endTime) >= now);
  if (!active.length) return undefined;
  return {
    limit: Math.min(...active.map(campaign => campaign.maxQtyPerOrder)),
    endsAt: new Date(Math.min(...active.map(campaign => Date.parse(campaign.endTime)))).toISOString(),
  };
}
