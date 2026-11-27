import { SaleSchedule } from '../components/product/SaleSchedule';
import { catalogCategories, saleDeadline } from '../utils/storefront';
import { normalize } from '../utils/product';
import { Fragment, useEffect } from "react";
import { paginate, pageNumbers, updateCatalogParams } from "../utils/catalog";
import {
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useProducts } from "../hooks/useProducts";
import { useStorefrontCampaigns } from "../hooks/useStorefrontCampaigns";
import { filterProducts } from "../utils/product";
import { CountdownTimer } from "../components/common/CountdownTimer";
import { ProductGrid } from "../components/product/ProductGrid";
import { LoadingSkeleton } from "../components/common/LoadingSkeleton";
import { EmptyState } from "../components/common/EmptyState";
import { Button } from "../components/common/Button";
import type { CampaignStatus } from "../types/campaign";

const campaignStatuses: { value: CampaignStatus | "ALL"; label: string }[] = [
  { value: "ACTIVE", label: "Đang diễn ra" },
  { value: "UPCOMING", label: "Sắp diễn ra" },
  { value: "ENDED", label: "Đã kết thúc" },
  { value: "ALL", label: "Tất cả đợt Flash Sale" },
];

export function ProductListingPage() {
  const { products, loading, error, retry } = useProducts();
  const {
    campaigns,
    now,
    loading: campaignsLoading,
    error: campaignsError,
    retry: retryCampaigns,
  } = useStorefrontCampaigns();
  const categories = catalogCategories(products);
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "",
    category = params.get("category") || "",
    sort = params.get("sort") || "discount";
  const min = params.get("min") || "",
    max = params.get("max") || "";
  const availability = params.get("availability") || "";
  const requestedStatus = params.get("status");
  const status = campaignStatuses.some((item) => item.value === requestedStatus)
    ? (requestedStatus as CampaignStatus | "ALL")
    : "ACTIVE";
  const selectedCampaignId = params.get("campaignId") || "";
  const update = (key: string, value: string) =>
    setParams((previous) => updateCatalogParams(previous, key, value));
  const chooseStatus = (value: CampaignStatus | "ALL") =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        value === "ACTIVE" ? next.delete("status") : next.set("status", value);
        next.delete("campaignId");
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  const availableCampaigns =
    status === "ALL"
      ? campaigns
      : campaigns.filter((campaign) => campaign.status === status);
  const selectedCampaign = availableCampaigns.find(
    (campaign) => campaign.campaignId === selectedCampaignId,
  );
  const deadline = saleDeadline(selectedCampaignId ? selectedCampaign ? [selectedCampaign] : [] : availableCampaigns, now);
  const campaignIds = selectedCampaignId
    ? new Set(selectedCampaign?.productIds ?? [])
    : status === "ALL"
      ? undefined
      : new Set(availableCampaigns.flatMap((campaign) => campaign.productIds));
  const campaignProducts = campaignIds
    ? products.filter((product) => campaignIds.has(product.productId))
    : products;
  const filtered = filterProducts(campaignProducts, {
    query,
    category,
    sort,
    availability,
    minPrice: Math.max(0, Number(min) || 0),
    maxPrice: max ? Math.max(0, Number(max) || 0) : Infinity,
  });
  const hasFilters = Boolean(
    query ||
      category ||
      min ||
      max ||
      availability ||
      selectedCampaignId ||
      status !== "ACTIVE",
  );
  const clearFilters = () => setParams({ status: "ALL" });
  const pagination = paginate(
    filtered,
    params.get("page"),
    params.get("pageSize"),
  );
  const pages = pageNumbers(pagination.page, pagination.totalPages);
  const busy = loading || campaignsLoading;
  const loadError = error || campaignsError.replace(/chiến dịch/gi, 'đợt Flash Sale');
  const refresh = () => {
    retry();
    retryCampaigns();
  };
  // Refreshes can shrink the catalog; canonicalize links to the displayed page.
  useEffect(() => {
    if (busy || loadError || !params.has("page")) return;
    const canonical = pagination.page === 1 ? null : String(pagination.page);
    if (params.get("page") !== canonical)
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          canonical ? next.set("page", canonical) : next.delete("page");
          return next;
        },
        { replace: true },
      );
  }, [busy, loadError, params, pagination.page, setParams]);
  return (
    <>
      <div className="listing-title-bar">
        <div className="container listing-title">
          <div>
            <h1>Tất cả sản phẩm Flash Sale</h1>
            <span aria-live="polite">
              {loading ? "Đang tải" : `${filtered.length} sản phẩm`}
            </span>
          </div>
          {deadline && (
            <CountdownTimer {...deadline} />
          )}
        </div>
      </div>
      <div className="container listing-page">
        <section className="filter-panel" aria-label="Bộ lọc sản phẩm">
          <div className="catalog-toolbar">
            <p>Tìm sản phẩm phù hợp với bạn</p>
          </div>
          <div className="campaign-filter">
            <span>Đợt Flash Sale:</span>
            <div
              className="filter-chips"
              role="group"
              aria-label="Trạng thái đợt Flash Sale"
            >
              {campaignStatuses.map((item) => (
                <button
                  key={item.value}
                  className={`chip ${status === item.value ? "selected" : ""}`}
                  onClick={() => chooseStatus(item.value)}
                  aria-pressed={status === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <SaleSchedule campaigns={availableCampaigns} selectedId={selectedCampaignId} onSelect={id => update("campaignId", id)} />
          <div className="filter-top">
            <div className="filter-chips category-scroll" role="group" aria-label="Danh mục">
              {["", ...categories].map((item) => (
                <button
                  key={item}
                  className={`chip ${normalize(category) === normalize(item) ? "selected" : ""}`}
                  onClick={() => update("category", item)}
                  aria-pressed={normalize(category) === normalize(item)}
                >
                  {item || "Tất cả danh mục"}
                </button>
              ))}
            </div>
            <label className="sort-label">
              Sắp xếp:
              <select
                aria-label="Sắp xếp sản phẩm"
                value={sort}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="discount">Giảm nhiều nhất</option>
                <option value="price-asc">Giá tăng dần</option>
                <option value="price-desc">Giá giảm dần</option>
                <option value="popular">Đang bán chạy</option>
              </select>
            </label>
          </div>
          <div className="price-filters">
            <span>
              <SlidersHorizontal size={15} /> Khoảng giá
            </span>
            <label>
              <span className="sr-only">Giá từ</span>
              <input
                type="number"
                min="0"
                step="10000"
                placeholder="Từ (₫)"
                value={min}
                onChange={(event) => update("min", event.target.value)}
              />
            </label>
            <span>—</span>
            <label>
              <span className="sr-only">Giá đến</span>
              <input
                type="number"
                min="0"
                step="10000"
                placeholder="Đến (₫)"
                value={max}
                onChange={(event) => update("max", event.target.value)}
              />
            </label>
            <label className="sort-label">
              Tồn kho:
              <select
                aria-label="Lọc tồn kho"
                value={availability}
                onChange={(event) => update("availability", event.target.value)}
              >
                <option value="">Tất cả</option>
                <option value="in-stock">Còn hàng</option>
                <option value="sold-out">Hết hàng</option>
              </select>
            </label>
            {query && <span className="query-label">Tìm: “{query}”</span>}
            {hasFilters && (
              <button className="clear-filters" onClick={clearFilters}>
                <X size={14} /> Xóa bộ lọc
              </button>
            )}
          </div>
        </section>
        {busy ? (
          <LoadingSkeleton count={pagination.pageSize} />
        ) : loadError ? (
          <EmptyState
            error
            title="Không thể tải sản phẩm"
            description={loadError}
          >
            <Button onClick={refresh}>Thử lại</Button>
          </EmptyState>
        ) : filtered.length ? (
          <>
            <ProductGrid products={pagination.items} />
            <nav
              className="catalog-pagination"
              aria-label="Phân trang sản phẩm"
            >
              <button
                disabled={pagination.page === 1}
                aria-label="Trang trước"
                onClick={() => update("page", String(pagination.page - 1))}
              >
                <ChevronLeft size={18} />
                <span>Trước</span>
              </button>
              {pages.map((page, index) => (
                <Fragment key={page}>
                  {index > 0 && page - pages[index - 1] > 1 && (
                    <span aria-hidden="true">…</span>
                  )}
                  <button
                    aria-label={`Trang ${page}`}
                    aria-current={page === pagination.page ? "page" : undefined}
                    onClick={() => update("page", String(page))}
                  >
                    {page}
                  </button>
                </Fragment>
              ))}
              <button
                disabled={pagination.page === pagination.totalPages}
                aria-label="Trang sau"
                onClick={() => update("page", String(pagination.page + 1))}
              >
                <span>Sau</span>
                <ChevronRight size={18} />
              </button>
            </nav>
          </>
        ) : (
          <EmptyState
            title="Không tìm thấy sản phẩm phù hợp"
            description="Thử từ khóa, khoảng giá hoặc đợt Flash Sale khác. Xóa bộ lọc để xem toàn bộ danh mục."
          >
            <Button onClick={clearFilters}>Xóa bộ lọc</Button>
          </EmptyState>
        )}
        {min && max && Number(min) > Number(max) && (
          <p className="filter-warning" role="status">
            Giá bắt đầu cần nhỏ hơn hoặc bằng giá kết thúc.
          </p>
        )}
      </div>
    </>
  );
}
