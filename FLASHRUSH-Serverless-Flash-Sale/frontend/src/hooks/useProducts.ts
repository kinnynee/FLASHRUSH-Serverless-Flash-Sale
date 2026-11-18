import { useEffect, useState } from 'react';
import { productService } from '../services/productService';
import type { Product } from '../types/product';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    productService.getProducts().then(data => { if (active) setProducts(data); }).catch((error: unknown) => { if (active) setError(error instanceof Error ? error.message : 'Không thể tải sản phẩm.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return { products, loading, error, retry: () => setAttempt(value => value + 1) };
}
