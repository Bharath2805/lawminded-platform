export default function AboutPage() {
  return (
    <section className="section">
      <div className="shell prose-page">
        <p className="eyebrow">About LawMinded</p>
        <h1>Built for teams delivering AI in regulated environments.</h1>
        <p>
          LawMinded was created to close a common execution gap: regulatory
          obligations are clear in principle, but difficult to operationalize in
          fast-moving product organizations. We provide the operating layer that
          turns policy into repeatable delivery workflows.
        </p>

        <h2>What we focus on</h2>
        <ul>
          <li>Operationalizing EU AI Act obligations into team workflows</li>
          <li>
            Reducing friction between legal, product, engineering, and security
          </li>
          <li>
            Creating consistent evidence trails for internal and external review
          </li>
        </ul>

        <h2>Delivery philosophy</h2>
        <p>
          We prioritize clear ownership, measurable controls, and practical
          implementation speed. Every module is designed to strengthen
          governance without slowing product delivery.
        </p>
      </div>
    </section>
  );
}
