import { describe, expect, it } from 'vitest';
import { parseProductImages, productFormFields } from './adminProduct';

const draft = { name: ' VINA ', category: 'Tai nghe', description: 'Tai nghe VINA', price: '100000',
  originalPrice: '500000', images: 'https://example.com/headphones.jpg',
  saleStartsAt: '2026-11-28T08:26:00Z', saleEndsAt: '2026-12-09T08:26:00Z' };

describe('admin product form validation', () => {
  it('blocks base64 before a comma can split it into broken image URLs', () => {
    expect(() => parseProductImages('data:image/png;base64,iVBORw0KGgoAAA')).toThrow('base64');
    expect(() => parseProductImages('https://example.com/a.jpg, data:image/png;base64,AAAA')).toThrow('base64');
  });
  it('accepts multiple URLs and existing local catalog images', () => {
    expect(parseProductImages('https://example.com/a.jpg, /images/b.jpg')).toEqual(['https://example.com/a.jpg', '/images/b.jpg']);
    expect(() => parseProductImages('not-an-image-url')).toThrow('Đường dẫn ảnh');
  });
  it('requires the description that the backend requires', () => {
    expect(() => productFormFields({ ...draft, description: '   ' })).toThrow('mô tả');
  });
  it('produces numeric prices and ISO dates for a valid submission', () => {
    expect(productFormFields(draft)).toMatchObject({ name: 'VINA', price: 100000, originalPrice: 500000,
      saleEndsAt: '2026-12-09T08:26:00.000Z', images: ['https://example.com/headphones.jpg'] });
  });
  it('rejects invalid prices and sale windows', () => {
    expect(() => productFormFields({ ...draft, price: '' })).toThrow('Giá');
    expect(() => productFormFields({ ...draft, saleEndsAt: draft.saleStartsAt })).toThrow('Kết thúc sale');
    expect(() => productFormFields({ ...draft, saleEndsAt: 'invalid' })).toThrow('Thời gian');
  });
});
