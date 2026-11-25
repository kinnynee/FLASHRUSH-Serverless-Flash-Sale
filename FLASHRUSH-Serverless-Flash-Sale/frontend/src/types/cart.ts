export interface CartItem {
  productId: string;
  name: string;
  image: string;
  quantity: number;
  unitPrice: number;
  selectedColor?: string;
  additions: { id: string; quantity: number }[];
}
