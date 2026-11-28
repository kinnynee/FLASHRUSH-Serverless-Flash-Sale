export function parseProductImages(value: string): string[] {
  if (/(?:^|[,\s])data:/i.test(value)) {
    throw new Error('Ảnh đang ở dạng data/base64. Hãy nhập đường dẫn ảnh http:// hoặc https://, không dán nội dung ảnh base64.');
  }
  const images = value.split(',').map(image => image.trim()).filter(Boolean);
  if (!images.length) throw new Error('Vui lòng nhập ít nhất một đường dẫn ảnh.');
  for (const image of images) {
    // Existing catalog images can also be served from the frontend public directory.
    if (image.startsWith('/') && !image.startsWith('//')) continue;
    try {
      const url = new URL(image);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch {
      throw new Error('Đường dẫn ảnh không hợp lệ. Dùng URL http:// hoặc https://; phân cách các ảnh bằng dấu phẩy.');
    }
  }
  return images;
}

export function productFormFields(draft: {
  name: string; category: string; description: string; price: string;
  originalPrice: string; images: string; saleStartsAt: string; saleEndsAt: string;
}) {
  for (const [label, value] of [['Tên sản phẩm', draft.name], ['Danh mục', draft.category], ['Mô tả', draft.description]]) {
    if (!value.trim()) throw new Error(`Vui lòng nhập ${label.toLowerCase()}.`);
    if (value.trim().length > 2000) throw new Error(`${label} không được vượt quá 2000 ký tự.`);
  }
  const price = Number(draft.price), originalPrice = Number(draft.originalPrice);
  if (!draft.price.trim() || !draft.originalPrice.trim() || !Number.isFinite(price) || !Number.isFinite(originalPrice) || price < 0 || originalPrice < 0) {
    throw new Error('Giá bán và giá gốc phải là số không âm.');
  }
  const end = Date.parse(draft.saleEndsAt);
  const start = draft.saleStartsAt ? Date.parse(draft.saleStartsAt) : undefined;
  if (!Number.isFinite(end) || (start !== undefined && !Number.isFinite(start))) throw new Error('Thời gian mở bán hoặc kết thúc sale không hợp lệ.');
  if (start !== undefined && end <= start) throw new Error('Kết thúc sale phải sau thời gian mở bán.');
  return {
    name: draft.name.trim(), category: draft.category.trim(), description: draft.description.trim(),
    price, originalPrice, images: parseProductImages(draft.images),
    saleStartsAt: start === undefined ? undefined : new Date(start).toISOString(),
    saleEndsAt: new Date(end).toISOString(),
  };
}
