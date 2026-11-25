import type { Campaign } from '../types/campaign';
import type { OrderItem, PricedOrderItem } from '../types/order';
import type { Product } from '../types/product';
import { campaignOffer } from '../utils/campaign';
import { campaignService } from './campaignService';
import { productService } from './productService';

type Selection = Pick<OrderItem, 'productId' | 'quantity' | 'selectedColor'> &
  Partial<Pick<OrderItem, 'name' | 'image' | 'unitPrice'>>;
export interface CheckoutCatalog { products: Map<string, Product>; campaigns: Campaign[] }

export async function loadCheckoutCatalog(ids: string[]): Promise<CheckoutCatalog> {
  const [products, campaigns] = await Promise.all([
    Promise.all(ids.map(id => productService.getProductById(id))),
    campaignService.getCampaigns(),
  ]);
  return { products: new Map(products.flatMap(product => product ? [[product.productId, product]] : [])), campaigns };
}

export function quoteSelections(selections: Selection[], catalog: CheckoutCatalog, now = Date.now()) {
  return selections.map(selection => {
    const { productId, selectedColor, quantity } = selection;
    const product = catalog.products.get(productId);
    const offer = campaignOffer(catalog.campaigns, productId, now);
    const stock = product?.stock;
    const limit = Math.min(stock ?? 0, offer?.limit ?? 0);
    const unitPrice = product?.price ?? selection.unitPrice;
    const item: OrderItem = {
      productId, quantity, selectedColor, unitPrice,
      name: product?.name ?? selection.name ?? productId, image: product?.images[0] ?? selection.image,
      subtotal: unitPrice === undefined ? undefined : unitPrice * quantity,
    };
    let issue = '';
    if (!product) issue = 'Sản phẩm không còn trong danh mục.';
    else if (!stock) issue = 'Sản phẩm đã hết hàng.';
    else if (!offer) issue = 'Sản phẩm không thuộc chiến dịch đang diễn ra.';
    else if (selectedColor && !product.colors?.includes(selectedColor)) issue = 'Màu đã chọn không còn khả dụng.';
    else if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > limit) issue = `Chỉ có thể đặt tối đa ${limit} sản phẩm này.`;
    return { item, stock, limit, issue, priceChanged: !!product && selection.unitPrice !== undefined && product.price !== selection.unitPrice };
  });
}

export const pricedItems = (lines: ReturnType<typeof quoteSelections>): PricedOrderItem[] =>
  lines.flatMap(({ item }) => item.unitPrice !== undefined ? [{ ...item, unitPrice: item.unitPrice }] : []);
