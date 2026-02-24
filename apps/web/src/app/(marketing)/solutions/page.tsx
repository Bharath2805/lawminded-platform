const solutions = [
  {
    title: "Legal and Compliance",
    description:
      "Track obligations, validate documentation readiness, and maintain evidence for supervisory engagement.",
  },
  {
    title: "Product and Engineering",
    description:
      "Translate regulatory requirements into implementation tasks with accountable owners and clear deadlines.",
  },
  {
    title: "Procurement and Trust Teams",
    description:
      "Respond faster to diligence requests with consistent, auditable records and policy evidence.",
  },
];

export default function SolutionsPage() {
  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">Solutions</p>
          <h1>
            Workflow modules tailored to the teams accountable for AI
            governance.
          </h1>
        </div>

        <div className="card-grid three">
          {solutions.map((item) => (
            <article key={item.title} className="feature-card">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
