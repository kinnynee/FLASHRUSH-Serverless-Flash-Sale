export const PAGE_SIZES = [8, 12, 16, 24] as const;

export function paginate<T>(
  items: T[],
  requestedPage: string | null,
  requestedSize: string | null,
) {
  const size = Number(requestedSize);
  const pageSize = PAGE_SIZES.find((value) => value === size) ?? 8;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const parsed = Number(requestedPage);
  const page =
    Number.isSafeInteger(parsed) && parsed > 0
      ? Math.min(parsed, totalPages)
      : 1;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    totalPages,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
  };
}

export function updateCatalogParams(
  params: URLSearchParams,
  key: string,
  value: string,
) {
  const next = new URLSearchParams(params);
  value ? next.set(key, value) : next.delete(key);
  if (key !== "page") next.delete("page");
  if (key === "status") next.delete("campaignId");
  return next;
}

export function pageNumbers(page: number, totalPages: number) {
  return [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
}
