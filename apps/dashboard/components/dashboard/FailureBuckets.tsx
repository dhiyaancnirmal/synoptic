import type { FailureBucketModel } from "./types";

interface FailureBucketsProps {
  items: FailureBucketModel[];
}

export function FailureBuckets({ items }: FailureBucketsProps) {
  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Failures</h3>
        <p className="pixel-text">reason and action</p>
      </header>
      <div className="dash-failure-grid">
        {items.map((item) => (
          <div key={`${item.reason}-${item.lastOccurrence}`} className="dash-failure-card">
            <p className="dash-failure-reason">{item.reason}</p>
            <p>count {item.count}</p>
            <p>last {item.lastOccurrence}</p>
            <p>agent {item.affectedAgent}</p>
            <p>{item.action}</p>
          </div>
        ))}
      </div>
      {items.length === 0 ? <p className="dash-empty-inline">No failure buckets available.</p> : null}
    </article>
  );
}
