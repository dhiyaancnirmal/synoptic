export function PaymentFlowRail() {
  const steps = ["Challenge", "Signed Retry", "Verify", "Settle"];

  return (
    <article className="dash-panel">
      <header className="dash-panel-head">
        <h3>x402 flow</h3>
        <p className="pixel-text">request lifecycle</p>
      </header>
      <ol className="dash-flow-rail">
        {steps.map((step, index) => (
          <li key={step}>
            <span className="pixel-text">0{index + 1}</span>
            <p>{step}</p>
          </li>
        ))}
      </ol>
    </article>
  );
}
