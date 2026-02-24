import Link from "next/link";

export function Hero() {
  return (
    <section className="hero">
      <div className="shell hero-grid">
        <div>
          <p className="eyebrow">EU AI Act Compliance Platform</p>
          <h1>
            Operational AI governance for teams building in regulated markets.
          </h1>
          <p className="lead">
            LawMinded helps legal, product, engineering, and security teams turn
            EU AI Act requirements into practical workflows, accountable
            controls, and audit-ready evidence.
          </p>
          <div className="hero-actions">
            <Link href="/request-demo" className="btn primary">
              Book a Demo
            </Link>
            <Link href="/features" className="btn secondary">
              View Capabilities
            </Link>
            <Link href="/resources" className="btn outline">
              Explore Resources
            </Link>
          </div>
        </div>

        <div className="hero-panel">
          <h3>What Teams Get</h3>
          <ul>
            <li>Structured risk classification and article mapping</li>
            <li>Versioned technical documentation and review logs</li>
            <li>Clear control ownership across internal teams</li>
            <li>Exportable evidence for audits and due diligence</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
