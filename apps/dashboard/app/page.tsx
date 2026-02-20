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
            <p className="pixel-text hero-kicker">Autonomous Agent Operations</p>
            <h2>Control and monitor autonomous agent execution across Kite and Monad.</h2>
            <p>
              Start and stop agent sessions, track x402 payment lifecycles from challenge to
              settlement, monitor spot trade execution with full attestation traceability, and
              observe real-time event streams from a unified workspace.
            </p>
            <div className="hero-actions">
              <Link href="/agents" className="action-primary">
                Open Workspace
              </Link>
              <a href="#capabilities" className="action-secondary">
                View Capabilities
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="capabilities" className="landing-section">
        <div className="section-inner">
          <div className="section-header">
            <p className="pixel-text section-label">Platform Capabilities</p>
            <h3>Everything you need to operate autonomous agents at scale.</h3>
          </div>
          <div className="capability-cards">
            <article className="capability-card">
              <div className="capability-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                </svg>
              </div>
              <h4>Agent Control</h4>
              <p>
                Start, pause, resume, and terminate agent sessions from dedicated screens. Track
                session state and request idempotency for all lifecycle operations.
              </p>
            </article>
            <article className="capability-card">
              <div className="capability-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <path d="M2 10h20" />
                </svg>
              </div>
              <h4>Payment Automation</h4>
              <p>
                Monitor x402 payment lifecycle: challenge issuance, user settlement, and
                confirmation. Full visibility into payment state machines and failure recovery.
              </p>
            </article>
            <article className="capability-card">
              <div className="capability-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 3v18h18" />
                  <path d="M7 16l4-4 4 4 6-6" />
                </svg>
              </div>
              <h4>Trade Execution</h4>
              <p>
                Execute spot trades through the interface. Track progression from quote through
                confirmation with Kite attestation linkage for every transaction.
              </p>
            </article>
            <article className="capability-card">
              <div className="capability-icon">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <h4>Stream Monitoring</h4>
              <p>
                Real-time event streams via WebSocket with polling fallback. View stream health
                status, observe cross-chain activity, and maintain audit trails.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section proof-section">
        <div className="section-inner">
          <div className="section-header">
            <p className="pixel-text section-label">Verifiable Execution</p>
            <h3>Every operation is traceable. Every transaction is auditable.</h3>
          </div>
          <div className="proof-grid">
            <article className="proof-card">
              <div className="proof-label pixel-text">Transactions</div>
              <h4>Execution Records</h4>
              <p>
                View confirmed transaction hashes, block confirmations, and gas consumption for all
                agent-initiated operations on Kite and Monad.
              </p>
            </article>
            <article className="proof-card">
              <div className="proof-label pixel-text">Settlement</div>
              <h4>Payment States</h4>
              <p>
                Full x402 payment lifecycle: challenge issued, settlement submitted, confirmation
                received. Track settlement failures and retry outcomes.
              </p>
            </article>
            <article className="proof-card">
              <div className="proof-label pixel-text">Attestations</div>
              <h4>Kite Attestation Linkage</h4>
              <p>
                Every trade and payment is signed by Kite validators. Retrieve attestation IDs and
                verify proofs independently.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="landing-section ops-section">
        <div className="section-inner">
          <div className="section-header">
            <p className="pixel-text section-label">Operations</p>
            <h3>Production-grade observability for agent infrastructure.</h3>
          </div>
          <div className="ops-grid">
            <article className="ops-card">
              <h4>Stream Health</h4>
              <p>
                QuickNode-powered ingestion streams with real-time health indicators. Degradation
                alerts and automatic fallback behavior.
              </p>
              <div className="ops-status">
                <span className="status-dot healthy"></span>
                <span className="pixel-text">Operational</span>
              </div>
            </article>
            <article className="ops-card">
              <h4>Audit Trail</h4>
              <p>
                Complete event history with timestamps, agent IDs, and correlation data. Export logs
                for compliance and incident response.
              </p>
            </article>
            <article className="ops-card">
              <h4>Session Isolation</h4>
              <p>
                Session-gated access with request idempotency. Each workspace operation is scoped to
                authenticated sessions.
              </p>
            </article>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-main">
            <p className="pixel-text footer-label">Ready to start?</p>
            <h3>Your agent operations workspace is one click away.</h3>
            <p className="footer-description">
              Access dedicated screens for agents, payments, trading, and activity. Session
              bootstrap available at <code>/login</code>.
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
              <span>Agent lifecycle</span>
            </div>
            <div className="route-link">
              <span className="pixel-text">/payments</span>
              <span>x402 flows</span>
            </div>
            <div className="route-link">
              <span className="pixel-text">/trading</span>
              <span>Spot execution</span>
            </div>
            <div className="route-link">
              <span className="pixel-text">/activity</span>
              <span>Event stream</span>
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
