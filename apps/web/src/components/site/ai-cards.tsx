import Link from "next/link";
import { CopyCheck, FileText, Database } from "lucide-react";

export function AICards() {
  return (
    <section className="section alt" id="aicards">
      <div className="shell ai-cards-grid">
        <div className="ai-cards-copy">
          <div>
            <p className="eyebrow">AI Cards Framework</p>
            <h2>Structured compliance records for AI systems</h2>
            <p className="lead">
              Designed to align legal, technical, and governance stakeholders
              around a shared, auditable record of system intent and controls.
            </p>
          </div>

          <ul className="ai-cards-list">
            <li className="ai-card-point">
              <span className="ai-card-point-icon">
                <Database size={14} />
              </span>
              <span>
                Versioned, exportable, and linked to governance evidence
              </span>
            </li>
            <li className="ai-card-point">
              <span className="ai-card-point-icon">
                <CopyCheck size={14} />
              </span>
              <span>Readable by both legal and technical teams</span>
            </li>
            <li className="ai-card-point">
              <span className="ai-card-point-icon">
                <FileText size={14} />
              </span>
              <span>
                Supports Article mapping, documentation, and audit readiness
              </span>
            </li>
          </ul>

          <div className="ai-cards-actions">
            <Link
              href="https://link.springer.com/chapter/10.1007/978-3-031-68024-3_3"
              className="btn secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText size={16} />
              Read the Springer publication
            </Link>
          </div>
        </div>

        <div className="panel ai-cards-quote">
          <blockquote>
            &quot;Compliance quality improves when legal intent and system
            behavior are documented in the same operational record.&quot;
          </blockquote>
          <div className="ai-cards-quote-dots" aria-hidden>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </section>
  );
}
