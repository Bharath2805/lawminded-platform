const featureCards = [
  {
    title: "Risk Classification Engine",
    detail:
      "Structured classification workflow for high-risk, limited-risk, and minimal-risk AI systems with evidence capture.",
  },
  {
    title: "Documentation Workspace",
    detail:
      "Generate and maintain technical documentation artifacts with version history and review ownership.",
  },
  {
    title: "Policy and Control Mapping",
    detail:
      "Map legal obligations to internal controls, owners, deadlines, and completion status in one view.",
  },
  {
    title: "Operational Audit Trail",
    detail:
      "Track decisions, policy acceptances, and compliance actions for internal audit and regulator requests.",
  },
];

const processSteps = [
  {
    step: "1. Intake",
    description:
      "Capture AI system context, intended use, stakeholders, and deployment geography.",
  },
  {
    step: "2. Classify",
    description:
      "Run guided risk assessment and determine obligations based on use-case profile.",
  },
  {
    step: "3. Implement",
    description:
      "Assign controls, documentation tasks, and governance workflows to role owners.",
  },
  {
    step: "4. Evidence",
    description:
      "Maintain exportable records for review, audits, and supervisory authority responses.",
  },
];

export function FeatureSections() {
  return (
    <>
      <section className="section">
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">Platform Capabilities</p>
            <h2>
              Everything needed for practical AI governance in production.
            </h2>
          </div>
          <div className="card-grid four">
            {featureCards.map((item) => (
              <article key={item.title} className="feature-card">
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt">
        <div className="shell">
          <div className="section-head">
            <p className="eyebrow">How It Works</p>
            <h2>
              A clear operating model from product ideation to compliance
              evidence.
            </h2>
          </div>
          <div className="card-grid two">
            {processSteps.map((item) => (
              <article key={item.step} className="step-card">
                <h3>{item.step}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
