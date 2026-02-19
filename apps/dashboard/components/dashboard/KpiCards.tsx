import type { DashboardKpiModel } from "./types";

interface KpiCardsProps {
  items: DashboardKpiModel[];
}

export function KpiCards({ items }: KpiCardsProps) {
  return (
    <section className="dash-kpi-grid">
      {items.map((item) => (
        <article key={item.label} className="dash-kpi-card">
          <p className="pixel-text">{item.label}</p>
          <h3>{item.value}</h3>
          <p>{item.hint}</p>
        </article>
      ))}
    </section>
  );
}
