const whyItMattersContent = [
  {
    title: "The Law",
    items: [
      "Risk qualification under Article 6 and Annex III",
      "Technical documentation requirements (including Annex IV)",
      "Transparency, logging, and governance obligations",
      "Human oversight and post-deployment controls",
    ],
  },
  {
    title: "The Risk",
    items: [
      "Fragmented ownership across legal and product teams",
      "Inconsistent documentation and weak evidence trails",
      "Slow responses to customer and regulator requests",
      "Material penalties and commercial exposure for non-compliance",
    ],
  },
  {
    title: "The Solution",
    items: [
      "A single operating model for AI governance execution",
      "Structured workflows with accountable owners and deadlines",
      "Continuous, versioned compliance documentation",
      "Audit-ready records for procurement and supervisory review",
    ],
  },
];

export function WhyItMatters() {
  return (
    <section className="section" id="why">
      <div className="shell">
        <div className="section-head">
          <p className="eyebrow">Why It Matters</p>
          <h2>
            Regulatory obligations are clear. Execution is where teams struggle.
          </h2>
        </div>
        <div className="card-grid three">
          {whyItMattersContent.map((column) => (
            <article key={column.title} className="metric-card">
              <h3>{column.title}</h3>
              <ul className="why-matters-list">
                {column.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
