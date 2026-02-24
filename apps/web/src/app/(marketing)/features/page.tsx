const features = [
  "Guided risk qualification and obligation mapping",
  "Documentation registry with version history",
  "Control assignment and ownership tracking",
  "Internal review workflows with approval records",
  "Export packages for audits and customer due diligence",
  "AI assistant for contextual compliance support",
];

export default function FeaturesPage() {
  return (
    <section className="section">
      <div className="shell prose-page">
        <p className="eyebrow">Features</p>
        <h1>
          Practical modules for production-grade AI governance operations.
        </h1>

        <ul className="feature-list">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
