import type { PaymentRowModel } from "./types";

interface PaymentsTableProps {
  rows: PaymentRowModel[];
  explorerUrl: string;
}

export function PaymentsTable({ rows, explorerUrl }: PaymentsTableProps) {
  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>Payments</h3>
        <p className="pixel-text">challenge and settlement</p>
      </header>
      <div className="dash-table">
        <div className="dash-table-head">
          <span>time</span>
          <span>agent</span>
          <span>route</span>
          <span>amount</span>
          <span>settlement</span>
          <span>tx</span>
          <span>status</span>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="dash-table-row">
            <span>{row.timestamp}</span>
            <span>{row.agentId}</span>
            <span>{row.route}</span>
            <span>{`${row.amount} ${row.asset} ${row.network}`}</span>
            <span>{row.settlementId}</span>
            <span>
              {row.txHash ? (
                <a href={`${explorerUrl}/tx/${row.txHash}`} target="_blank" rel="noreferrer">
                  open
                </a>
              ) : (
                "N/A"
              )}
            </span>
            <span className={`dash-status ${row.status}`}>{row.status}</span>
          </div>
        ))}
      </div>
      {rows.length === 0 ? <p className="dash-empty-inline">No payment rows available.</p> : null}
    </article>
  );
}
