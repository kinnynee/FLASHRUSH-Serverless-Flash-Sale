import type { ImgHTMLAttributes } from 'react';
export function ProductImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/product-placeholder.svg'; }} />;
}
