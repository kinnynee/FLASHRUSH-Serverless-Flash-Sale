export interface Product {
  productId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  originalPrice: number;
  stock: number;
  initialStock: number;
  images: string[];
  isFlashSale: boolean;
  saleEndsAt: string;
  colors?: string[];
  specs?: { label: string; value: string; detail: string }[];
}

/** Temporary frontend contract; Developer 2 must validate before integration. */
export interface CheckoutIntent {
  productId: string;
  quantity: number;
  selectedColor?: string;
}
