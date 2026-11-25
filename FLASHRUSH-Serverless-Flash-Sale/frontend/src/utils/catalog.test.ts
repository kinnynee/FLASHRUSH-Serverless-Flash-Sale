import { describe, expect, it } from "vitest";
import { paginate, pageNumbers, updateCatalogParams } from "./catalog";

describe("Catalog pagination", () => {
  const items = Array.from({ length: 19 }, (_, index) => index + 1);
  it("covers all results once, including the partial last page", () => {
    const pages = [1, 2, 3].map((page) => paginate(items, String(page), "8"));
    expect(pages.flatMap((page) => page.items)).toEqual(items);
    expect(pages[2]).toMatchObject({
      from: 17,
      to: 19,
      page: 3,
      totalPages: 3,
      total: 19,
    });
  });
  it("handles empty results and clamps links after catalog shrinkage", () => {
    expect(paginate([], "9", "8")).toMatchObject({
      page: 1,
      from: 0,
      to: 0,
      items: [],
    });
    expect(paginate(items.slice(0, 2), "3", "8")).toMatchObject({
      page: 1,
      items: [1, 2],
    });
  });
  it("rejects malformed or unbounded page sizes and page numbers", () => {
    for (const page of ["-1", "NaN", "Infinity", "1.5", "9007199254740992"]) {
      expect(paginate(items, page, "999999").page).toBe(1);
      expect(paginate(items, page, "999999").pageSize).toBe(12);
    }
    expect(paginate(items, "999", "16")).toMatchObject({
      page: 2,
      from: 17,
      to: 19,
    });
  });
  it("resets page on filters, search and size while retaining other criteria", () => {
    const params = new URLSearchParams(
      "q=sony&category=Audio&page=3&campaignId=demo",
    );
    for (const key of [
      "q",
      "category",
      "min",
      "max",
      "sort",
      "pageSize",
      "availability",
      "campaignId",
    ]) {
      expect(updateCatalogParams(params, key, "value").has("page")).toBe(false);
    }
    const next = updateCatalogParams(params, "status", "ENDED");
    expect(next.get("q")).toBe("sony");
    expect(next.has("campaignId")).toBe(false);
    expect(params.get("page")).toBe("3");
    expect(updateCatalogParams(params, "page", "2").get("category")).toBe(
      "Audio",
    );
  });
  it("bounds pagination controls even with a large catalog", () => {
    expect(pageNumbers(50, 100)).toEqual([1, 49, 50, 51, 100]);
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
});
