import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { updateCatalogParams } from "../../utils/catalog";
export function SearchBar() {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const [value, setValue] = useState(query);
  const navigate = useNavigate();
  const location = useLocation();
  const search = (term: string) => {
    const base =
      location.pathname === "/products"
        ? params
        : new URLSearchParams({ status: "ALL" });
    const next = updateCatalogParams(base, "q", term.trim());
    navigate(`/products?${next}`);
  };
  useEffect(() => setValue(query), [query]);
  return (
    <form
      className="search-bar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        search(value);
      }}
    >
      <button type="submit" aria-label="Tìm kiếm">
        <Search size={19} />
      </button>
      <input
        aria-label="Tìm kiếm sản phẩm"
        placeholder="Tìm kiếm sản phẩm Flash Sale…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Xóa tìm kiếm"
          onClick={() => {
            setValue("");
            search("");
          }}
        >
          <X size={16} />
        </button>
      )}
    </form>
  );
}
