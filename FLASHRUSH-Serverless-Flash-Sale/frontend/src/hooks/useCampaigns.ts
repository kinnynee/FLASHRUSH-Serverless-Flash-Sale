import { useCallback, useEffect, useState } from 'react';
import { campaignService } from '../services/campaignService';
import type { Campaign } from '../types/campaign';

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const retry = useCallback(() => setVersion(value => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    campaignService.getCampaigns().then(
      result => { if (active) { setCampaigns(result); setError(''); } },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Không thể tải chiến dịch.'); },
    ).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [version]);
  return { campaigns, loading, error, retry, setCampaigns };
}
