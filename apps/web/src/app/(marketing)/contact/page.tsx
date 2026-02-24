import { ContactForm } from "@/components/forms/contact-form";

export default function ContactPage() {
  return (
    <section className="section">
      <div className="shell split">
        <div>
          <p className="eyebrow">Contact</p>
          <h1>Contact the LawMinded team.</h1>
          <p>
            Whether you are evaluating procurement, implementation, or
            deployment readiness, we can guide your next step.
          </p>
          <ul className="plain-list">
            <li>Email: contact@lawminded.ai</li>
            <li>Response time: within 1 business day</li>
            <li>Coverage: EU and global teams</li>
          </ul>
        </div>

        <div className="panel">
          <h2>Send a message</h2>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
