import { products } from '../mocks/products';
import type { Campaign, CampaignInput, CampaignStatus } from '../types/campaign';

export interface CampaignService {
  getCampaigns(): Promise<Campaign[]>;
  createCampaign(input: CampaignInput): Promise<Campaign>;
  updateCampaign(campaignId: string, input: Partial<CampaignInput>): Promise<Campaign>;
}

const storageKey = 'flashrush.demo.campaigns.v1';
function campaignStatus(campaign: Campaign, now = Date.now()): CampaignStatus {
  if (now < Date.parse(campaign.startTime)) return 'UPCOMING';
  if (now > Date.parse(campaign.endTime)) return 'ENDED';
  return 'ACTIVE';
}
function defaults(): Campaign[] {
  const now = Date.now();
  return [
    { campaignId: 'demo-active', name: 'Flash Sale hôm nay', startTime: new Date(now - 3600000).toISOString(),
      endTime: new Date(now + 3 * 3600000).toISOString(), status: 'ACTIVE',
      productIds: products.map(product => product.productId), maxQtyPerOrder: 1 },
    { campaignId: 'demo-upcoming', name: 'Siêu sale công nghệ', startTime: new Date(now + 86400000).toISOString(),
      endTime: new Date(now + 27 * 3600000).toISOString(), status: 'UPCOMING',
      productIds: products.slice(5, 8).map(product => product.productId), maxQtyPerOrder: 2 },
    { campaignId: 'demo-ended', name: 'Ưu đãi tuần trước', startTime: new Date(now - 8 * 86400000).toISOString(),
      endTime: new Date(now - 7 * 86400000).toISOString(), status: 'ENDED',
      productIds: products.slice(8, 11).map(product => product.productId), maxQtyPerOrder: 1 },
  ];
}
function parseCampaign(value: unknown): Campaign {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dữ liệu chiến dịch không hợp lệ.');
  const item = value as Record<string, unknown>;
  if (typeof item.campaignId !== 'string' || typeof item.name !== 'string' ||
      typeof item.startTime !== 'string' || !Number.isFinite(Date.parse(item.startTime)) ||
      typeof item.endTime !== 'string' || !Number.isFinite(Date.parse(item.endTime)) ||
      !Array.isArray(item.productIds) || item.productIds.some(id => typeof id !== 'string') ||
      !Number.isInteger(item.maxQtyPerOrder) || Number(item.maxQtyPerOrder) < 1) {
    throw new Error('Dữ liệu chiến dịch không hợp lệ.');
  }
  const campaign = item as unknown as Campaign;
  return { ...campaign, status: campaignStatus(campaign) };
}
function readStored(): Campaign[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return defaults();
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) throw new Error('Dữ liệu chiến dịch demo không hợp lệ.');
    return parsed.map(parseCampaign);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Không thể đọc chiến dịch demo đã lưu.');
    throw error;
  }
}
function save(campaigns: Campaign[]) {
  localStorage.setItem(storageKey, JSON.stringify(campaigns));
}
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error('Chưa cấu hình API chiến dịch.');
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined) as { error?: { code?: string } } | undefined;
    throw new Error(body?.error?.code || 'Không thể cập nhật chiến dịch.');
  }
  return response.json();
}
function mockMode() {
  return import.meta.env.VITE_ORDER_MODE !== 'http';
}

export const campaignService: CampaignService = {
  async getCampaigns() {
    if (mockMode()) return readStored().map(campaign => ({ ...campaign, status: campaignStatus(campaign) }));
    const data = await request('/campaigns');
    if (!data || typeof data !== 'object' || !Array.isArray((data as { items?: unknown }).items)) {
      throw new Error('Danh sách chiến dịch không hợp lệ.');
    }
    return ((data as { items: unknown[] }).items).map(parseCampaign);
  },
  async createCampaign(input) {
    if (mockMode()) {
      const campaign = parseCampaign({ ...input, campaignId: crypto.randomUUID(), status: 'UPCOMING' });
      const all = readStored();
      all.push(campaign);
      save(all);
      return campaign;
    }
    return parseCampaign(await request('/admin/campaigns', { method: 'POST', body: JSON.stringify(input) }));
  },
  async updateCampaign(campaignId, input) {
    if (mockMode()) {
      const all = readStored();
      const index = all.findIndex(campaign => campaign.campaignId === campaignId);
      if (index < 0) throw new Error('Không tìm thấy chiến dịch.');
      all[index] = parseCampaign({ ...all[index], ...input });
      save(all);
      return all[index];
    }
    return parseCampaign(await request(`/admin/campaigns/${encodeURIComponent(campaignId)}`, {
      method: 'PATCH', body: JSON.stringify(input),
    }));
  },
};
