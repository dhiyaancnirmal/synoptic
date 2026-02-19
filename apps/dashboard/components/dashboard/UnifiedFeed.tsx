import type { FeedFilter, UnifiedFeedItem } from "./types";

interface UnifiedFeedProps {
  items: UnifiedFeedItem[];
  activeFilter: FeedFilter;
  onFilterChange: (filter: FeedFilter) => void;
}

const filters: FeedFilter[] = ["all", "ecommerce", "spot", "perps", "prediction", "payment", "failure"];

export function UnifiedFeed({ items, activeFilter, onFilterChange }: UnifiedFeedProps) {
  const filtered = activeFilter === "all" ? items : items.filter((event) => event.domain === activeFilter);

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Unified feed</h3>
        <p className="pixel-text">event stream</p>
      </header>
      <div className="dash-filter-row">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            className={`dash-filter ${activeFilter === filter ? "active" : ""}`}
            onClick={() => onFilterChange(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="dash-feed-list">
        {filtered.map((event) => (
          <div key={event.id} className={`dash-feed-row ${event.status.toLowerCase()}`}>
            <p className="pixel-text">{event.timestamp}</p>
            <p className="dash-feed-title">{event.eventName}</p>
            <p>{event.detail}</p>
          </div>
        ))}
        {filtered.length === 0 ? <p className="dash-empty-inline">No events for this filter.</p> : null}
      </div>
    </article>
  );
}
