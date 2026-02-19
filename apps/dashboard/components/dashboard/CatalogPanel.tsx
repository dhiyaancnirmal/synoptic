"use client";

import { useMemo, useState } from "react";
import type { CatalogProductView } from "@/lib/api";

interface CatalogPanelProps {
  products: CatalogProductView[];
  loading: boolean;
  error?: string;
  onSearch: (query: string) => void;
}

export function CatalogPanel({ products, loading, error, onSearch }: CatalogPanelProps) {
  const [query, setQuery] = useState("running shoes");

  const hasProducts = products.length > 0;
  const title = useMemo(() => (loading ? "Searching catalog" : "Shopify catalog"), [loading]);

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>{title}</h3>
        <p className="pixel-text">commerce discovery</p>
      </header>

      <form
        className="dash-filter-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch(query);
        }}
      >
        <input
          className="dash-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search products"
          aria-label="Shopify catalog search"
        />
        <button type="submit" className="dash-filter active">
          search
        </button>
      </form>

      {error ? <p className="dash-empty-inline">{error}</p> : null}
      {loading ? <p className="dash-empty-inline">Loading catalog results...</p> : null}

      {!loading && hasProducts ? (
        <div className="dash-catalog-grid">
          {products.map((product) => (
            <div key={product.id} className="dash-catalog-card">
              {product.imageUrl ? <img src={product.imageUrl} alt={product.title} loading="lazy" /> : <div className="dash-catalog-image-placeholder">no image</div>}
              <p className="pixel-text">{product.vendor ?? "shopify"}</p>
              <h4>{product.title}</h4>
              <p>{product.price ? `$${product.price}` : "price unavailable"}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && !hasProducts && !error ? <p className="dash-empty-inline">No products returned yet. Try another query.</p> : null}
    </article>
  );
}
