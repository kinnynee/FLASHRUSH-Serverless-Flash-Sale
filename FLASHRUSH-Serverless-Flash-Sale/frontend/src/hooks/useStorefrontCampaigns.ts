import { useEffect, useState } from 'react';
import { useCampaigns } from './useCampaigns';
import { getServerNow } from '../utils/serverClock';
import { saleStatus } from '../utils/storefront';

export function useStorefrontCampaigns() {
  const result = useCampaigns();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const now = getServerNow();
  return { ...result, now, campaigns: result.campaigns.map(campaign => ({ ...campaign, status: saleStatus(campaign, now) })) };
}
