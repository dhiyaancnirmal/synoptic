import Dither from "../components/Dither";
import { pingApi } from "../lib/api";
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
            <h2>Synoptic is an agent operations dashboard on Kite.</h2>
            <p>
              Track autonomous agent identity, x402 payment lifecycle, execution outcomes, and settlement evidence in
              one operator view.
            </p>
            <div className="hero-actions">
              <Link href="/dashboard">Open Dashboard</Link>
              <a href="#flows" className="action-secondary">
                View Payment Flow
              </a>
            </div>
          </div>

          <div id="flows" className="flow-grid">
            <article>
              <p className="pixel-text">01</p>
              <h3>Challenge</h3>
              <p>Paid endpoint returns HTTP 402 with payment requirements.</p>
            </article>
            <article>
              <p className="pixel-text">02</p>
              <h3>Payment</h3>
              <p>Agent retries with signed X-PAYMENT payload under policy limits.</p>
            </article>
            <article>
              <p className="pixel-text">03</p>
              <h3>Settlement</h3>
              <p>Payment provider verifies and settles, then execution result is returned.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-inner narrative-block">
          <div className="narrative-header">
            <p className="pixel-text section-label">What Synoptic Is</p>
            <h3>Operational visibility for autonomous agent actions.</h3>
          </div>
          <div className="narrative-cards">
            <article>
              <h4>Agent Identity</h4>
              <p>Monitor agent ownership, status, and runtime state with wallet-linked records.</p>
            </article>
            <article>
              <h4>x402 Payment Lifecycle</h4>
              <p>Trace challenge, signed retry, verification, and settlement for every paid action.</p>
            </article>
            <article>
              <h4>Execution Evidence</h4>
              <p>Map actions to events, failure reasons, and chain references for operator review.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-inner narrative-block">
          <div className="narrative-header">
            <p className="pixel-text section-label">Now and Next</p>
            <h3>Spot execution is the production path in this release.</h3>
          </div>
          <div className="narrative-cards">
            <article>
              <h4>Now</h4>
              <p>Spot flow with x402 evidence chain and failure handling.</p>
            </article>
            <article>
              <h4>Supported Domain</h4>
              <p>Ecommerce and trading events can share one unified operator feed.</p>
            </article>
            <article>
              <h4>Next</h4>
              <p>Expand to additional venues only after live settlement, risk controls, and evidence parity.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="section-inner narrative-block">
          <div className="narrative-header">
            <p className="pixel-text section-label">Bounty Fit</p>
            <h3>Built for autonomous execution with verifiable payment and settlement traces.</h3>
          </div>
          <ul className="narrative-list">
            <li>Autonomous execution with minimal operator intervention</li>
            <li>Payments tied directly to executed actions</li>
            <li>Verifiable logs and on-chain references</li>
            <li>Explicit failure states and operator-safe messaging</li>
          </ul>
        </div>
      </section>

      <section id="terminal" className="footer-zone">
        <div className="footer-grid">
          <div className="footer-copy">
            <p className="pixel-text">Status</p>
            <h3>Every paid action maps to an event, settlement state, and chain reference.</h3>
            <p>
              Frontend tracks frozen contracts only. Event envelope includes eventId, agentId, timestamp, status, and
              metadata.
            </p>
            <Link className="footer-link" href="/dashboard">
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
