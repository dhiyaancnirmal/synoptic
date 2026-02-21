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
            <p className="pixel-text hero-kicker">Agent Operations Platform</p>
            <h2>Operate autonomous agents with control, visibility, and audit-ready records.</h2>
            <p>
              Synoptic is the command center for teams running agents across Kite and Monad.
              Manage sessions, confirm x402 payments, execute swap/order + liquidity workflows, and
              review live activity from one workspace.
            </p>
            <div className="hero-actions">
              <Link href="/agents" className="action-primary">
                Open Workspace
              </Link>
              <Link href="/login" className="action-secondary">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section id="platform" className="landing-section">
        <div className="section-inner">
          <div className="section-header">
            <p className="pixel-text section-label">What Synoptic Does</p>
            <h3>One platform for operating agents from execution to evidence.</h3>
          </div>
          <div className="capability-cards">
            <article className="capability-card">
              <p className="pixel-text capability-index">01</p>
              <h4>Control Agent Sessions</h4>
              <p>
                Start, pause, resume, and stop agent sessions with predictable lifecycle states and
                idempotent requests.
              </p>
            </article>
            <article className="capability-card">
              <p className="pixel-text capability-index">02</p>
              <h4>Track x402 Payments</h4>
              <p>
                Monitor challenge, settlement, confirmation, and retry paths so payment failures
                are visible and recoverable.
              </p>
            </article>
            <article className="capability-card">
              <p className="pixel-text capability-index">03</p>
              <h4>Execute and Verify Trades</h4>
              <p>
                Run swaps, orders, and LP actions with routing metadata plus transaction and
                attestation context.
              </p>
            </article>
            <article className="capability-card">
              <p className="pixel-text capability-index">04</p>
              <h4>Monitor Live Operations</h4>
              <p>
                Follow real-time streams with health visibility, timestamped activity logs, and a
                complete operational trail.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section ops-section">
        <div className="section-inner">
          <div className="section-header">
            <p className="pixel-text section-label">Who It Serves</p>
            <h3>Built for teams operating agents in production.</h3>
          </div>
          <div className="ops-grid">
            <article className="ops-card">
              <h4>Operations Teams</h4>
              <p>
                Keep a clear view of active agents, service health, and exceptions without digging
                through multiple tools.
              </p>
            </article>
            <article className="ops-card">
              <h4>Trading Teams</h4>
              <p>
                Manage execution flow from quote to confirmation while preserving traceability for
                every transaction.
              </p>
            </article>
            <article className="ops-card">
              <h4>Risk and Compliance</h4>
              <p>
                Access payment states, event logs, and attestations needed for audits, incident
                response, and post-trade review.
              </p>
            </article>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-main">
            <p className="pixel-text footer-label">Get Started</p>
            <h3>Use the workspace to run agents with full operational context.</h3>
            <p className="footer-description">
              Core routes cover agent lifecycle, payments, trading, activity, and marketplace
              workflows.
            </p>
            <div className="footer-actions">
              <Link href="/agents" className="action-primary">
                Open Workspace
              </Link>
              <Link href="/login" className="action-secondary">
                Sign In
              </Link>
            </div>
          </div>
          <div className="footer-routes">
            <div className="route-link">
              <span className="pixel-text">/agents</span>
              <span>Agent lifecycle control</span>
            </div>
            <div className="route-link">
              <span className="pixel-text">/payments</span>
              <span>x402 lifecycle tracking</span>
            </div>
            <div className="route-link">
              <span className="pixel-text">/trading</span>
              <span>Trade execution workspace</span>
            </div>
            <div className="route-link">
              <span className="pixel-text">/activity</span>
              <span>Event and stream history</span>
            </div>
          </div>
        </div>
        <div className="footer-brand">
          <span className="logo-font bottom-logo">Synoptic</span>
          <span className="pixel-text copyright">Autonomous Agent Operations</span>
        </div>
      </footer>
    </main>
  );
}
