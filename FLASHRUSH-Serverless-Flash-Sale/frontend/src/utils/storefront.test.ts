import { describe, expect, it } from 'vitest';
import { catalogCategories, saleDeadline, saleStatus } from './storefront';
import { filterProducts } from './product';
import type { Product } from '../types/product';
import type { Campaign } from '../types/campaign';

const product: Product = { productId: 'one', name: 'Test', description: '', category: 'Tai nghe', price: 100, originalPrice: 200, stock: 5, initialStock: 10, images: [], isFlashSale: true, saleEndsAt: '2030-01-01T12:00:00Z' };
const campaign: Campaign = { campaignId: 'sale', name: 'Sale', startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-01T12:00:00Z', status: 'ACTIVE', productIds: ['one'], maxQtyPerOrder: 1 };
describe('Storefront catalog presentation', () => {
  it('deduplicates accents, casing and whitespace, retaining an accented label', () => {
    const products = ['BAN PHIM', 'Bàn phím', ' bàn   phím ', 'Tai nghe'].map(category => ({ ...product, category }));
    expect(catalogCategories(products)).toEqual(['Bàn phím', 'Tai nghe']);
    expect(filterProducts(products, { query: '', category: 'bàn PHÍM', minPrice: 0, maxPrice: Infinity, sort: 'discount' })).toHaveLength(3);
    expect(products[0].category).toBe('BAN PHIM');
  });
  it('transitions through actual time boundaries even when API status is stale', () => {
    expect(saleStatus(campaign, Date.parse(campaign.startTime) - 1)).toBe('UPCOMING');
    expect(saleStatus(campaign, Date.parse(campaign.startTime))).toBe('ACTIVE');
    expect(saleStatus(campaign, Date.parse(campaign.endTime))).toBe('ENDED');
  });
  it('uses the selected schedule and never invents a deadline for ended or missing sales', () => {
    expect(saleDeadline([campaign], Date.parse('2030-01-01T09:00:00Z'))).toEqual({ target: campaign.startTime, label: 'Mở bán trong:' });
    expect(saleDeadline([campaign], Date.parse('2030-01-01T11:00:00Z'))).toEqual({ target: campaign.endTime, label: 'Kết thúc trong:' });
    expect(saleDeadline([campaign], Date.parse('2030-01-01T13:00:00Z'))).toBeUndefined();
    expect(saleDeadline([], Date.now())).toBeUndefined();
  });
  it('respects API sale overrides and picks the earliest live deadline', () => {
    const second = { ...campaign, saleEndsAt: '2030-01-01T11:30:00Z' };
    expect(saleDeadline([campaign, second], Date.parse('2030-01-01T11:00:00Z'))?.target).toBe(second.saleEndsAt);
    expect(saleStatus(second, Date.parse('2030-01-01T11:30:00Z'))).toBe('ENDED');
  });
});
