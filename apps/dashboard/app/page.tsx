import Dither from "../components/Dither";
import FaultyTerminal from "../components/FaultyTerminal";
import { pingApi } from "../lib/api";

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
            <h2>Run autonomous spot execution with verifiable payment state.</h2>
            <p>
              Synoptic exposes agent identity, x402 payment negotiation, settlement, and on-chain confirmation in one
              timeline. Perps and prediction are staged next.
            </p>
            <div className="hero-actions">
              <a href="#flows">View execution flow</a>
              <a href="#terminal" className="action-secondary">
                Inspect event feed
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
              <p>Facilitator verifies and settles, then execution result is returned.</p>
            </article>
          </div>
        </div>
      </section>

      <section id="terminal" className="footer-zone">
        <div className="footer-terminal-bg" aria-hidden>
          <FaultyTerminal
            scale={1.5}
            gridMul={[2, 1]}
            digitSize={1.2}
            timeScale={0.5}
            pause={false}
            scanlineIntensity={0.5}
            glitchAmount={1}
            flickerAmount={1}
            noiseAmp={1}
            chromaticAberration={0}
            dither={0}
            curvature={0.1}
            tint="#eb5e28"
            mouseReact
            mouseStrength={0.5}
            pageLoadAnimation
            brightness={0.6}
          />
        </div>
        <div className="footer-grid">
          <div className="footer-copy">
            <p className="pixel-text">Status</p>
            <h3>Every paid action maps to an event, a settlement state, and a chain reference.</h3>
            <p>
              Frontend tracks frozen contracts only. Event envelope includes eventId, agentId, timestamp, status, and
              metadata.
            </p>
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
