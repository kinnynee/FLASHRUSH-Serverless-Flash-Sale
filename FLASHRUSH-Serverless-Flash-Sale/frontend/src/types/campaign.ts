export type CampaignStatus = 'UPCOMING' | 'ACTIVE' | 'ENDED';

export interface Campaign {
  campaignId: string;
  name: string;
  startTime: string;
  endTime: string;
  status: CampaignStatus;
  productIds: string[];
  maxQtyPerOrder: number;
}

export type CampaignInput = Omit<Campaign, 'campaignId' | 'status'>;
