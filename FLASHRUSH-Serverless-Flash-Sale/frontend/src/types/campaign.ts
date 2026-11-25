export type CampaignStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';
export type SaleStatus = 'UPCOMING' | 'LIVE' | 'ENDED' | 'SOLD_OUT';

export interface Campaign {
  campaignId: string;
  name: string;
  startTime: string;
  endTime: string;
  status: CampaignStatus;
  saleStatus?: SaleStatus;
  saleStartsAt?: string;
  saleEndsAt?: string;
  serverTime?: string;
  productIds: string[];
  maxQtyPerOrder: number;
}

export type CampaignInput = Omit<Campaign, 'campaignId' | 'status'>;
