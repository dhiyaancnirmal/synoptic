import Dither from "../components/Dither";
import { pingApi } from "../lib/api/client";
import Link from "next/link";

export default async function HomePage() {
  const health = await pingApi();

  return (
    <main className="landing-shell">
      <section className="hero">
        <div className="hero-dither">
          <Dither
            waveColor={[0.9215, 0.3686, 0.1568]}
            disableAnimation={false}
            enableMouseInteraction={false}
            mouseRadius={0.3}
            colorNum={4}
            waveAmplitude={0.3}
            waveFrequency={3}
            waveSpeed={0.05}
          />
        </div>
        <div className="hero-content">
          <header className="top-row">
            <h1 className="logo-font top-logo">Synoptic</h1>
            <div className="top-meta pixel-text">
              <span>Kite Chain 2368</span>
              <span>API {health}</span>
            </div>
          </header>

          <div className="hero-copy">
            <p className="pixel-text hero-kicker">Agent Command Center</p>
            <h2>Synoptic is a routed operator runtime for autonomous agents.</h2>
            <p>
              Run lifecycle controls, watch x402 payments, inspect trade execution stages, and track cross-chain
              activity across Kite and Monad from one workspace.
            </p>
            <div className="hero-actions">
              <Link href="/agents">Open Agents</Link>
              <a href="#flows" className="action-secondary">
                View Runtime Flow
              </a>
            </div>
          </div>

          <div id="flows" className="flow-grid">
            <article>
              <p className="pixel-text">01</p>
              <h3>Control</h3>
              <p>Operator starts, stops, or triggers agents from canonical route-based screens.</p>
            </article>
            <article>
              <p className="pixel-text">02</p>
              <h3>Observe</h3>
              <p>Realtime events stream over WebSocket with polling fallback when transport degrades.</p>
            </article>
            <article>
              <p className="pixel-text">03</p>
              <h3>Verify</h3>
              <p>Payments, trades, and activity correlate by IDs and chain references for auditability.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-inner narrative-block">
          <div className="narrative-header">
            <p className="pixel-text section-label">What Synoptic Is</p>
            <h3>Operational control surface for autonomous execution pipelines.</h3>
          </div>
          <div className="narrative-cards">
            <article>
              <h4>Routed Workspace</h4>
              <p>Dedicated screens for Agents, Payments, Trading, and Activity replace one-page tab sprawl.</p>
            </article>
            <article>
              <h4>Compat + Canonical</h4>
              <p>Frontend supports compatibility routes now while preparing clean canonical /api cutover.</p>
            </article>
            <article>
              <h4>Normalized Contracts</h4>
              <p>View-model adapters normalize payload shapes so UI behavior stays stable during backend evolution.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-inner narrative-block">
          <div className="narrative-header">
            <p className="pixel-text section-label">Now and Next</p>
            <h3>Phase-gated frontend is live; integrations and hardening continue behind stable interfaces.</h3>
          </div>
          <div className="narrative-cards">
            <article>
              <h4>Now</h4>
              <p>Route-based runtime, websocket-first updates, action idempotency, and session-gated access.</p>
            </article>
            <article>
              <h4>In Progress</h4>
              <p>Canonical API adoption, richer payment/trade state machines, and stronger auth UX.</p>
            </article>
            <article>
              <h4>Next</h4>
              <p>Compatibility cleanup, full real-provider cutover, and stricter production observability controls.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-inner narrative-block">
          <div className="narrative-header">
            <p className="pixel-text section-label">Bounty Fit</p>
            <h3>Built for autonomous execution with verifiable lifecycle traces across every surface.</h3>
          </div>
          <ul className="narrative-list">
            <li>Agent lifecycle controls with request idempotency protections</li>
            <li>x402 challenge and settlement states visible in dedicated payment flows</li>
            <li>Trade progression from quote to confirmation with attestation linkage</li>
            <li>Cross-chain timeline with coherent event normalization and replay safety</li>
          </ul>
        </div>
      </section>

      <section id="terminal" className="footer-zone">
        <div className="footer-grid">
          <div className="footer-copy">
            <p className="pixel-text">Status</p>
            <h3>Synoptic is now a route-first control and observability runtime.</h3>
            <p>
              Start with <code>/agents</code>, validate <code>/payments</code>, inspect <code>/trading</code>, and
              audit <code>/activity</code>. Session bootstrap is available at <code>/login</code>.
            </p>
            <Link className="footer-link" href="/agents">
              Open operator workspace
            </Link>
          </div>
          <div />
        </div>
        <div className="footer-mark">
          <h4 className="logo-font bottom-logo">Synoptic</h4>
        </div>
      </section>
    </main>
  );
}
