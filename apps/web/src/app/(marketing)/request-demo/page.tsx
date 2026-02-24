import { RequestDemoForm } from "@/components/forms/request-demo-form";

export default function RequestDemoPage() {
  return (
    <section className="section">
      <div className="shell split">
        <div>
          <p className="eyebrow">Request Demo</p>
          <h1>Book a walkthrough tailored to your governance requirements.</h1>
          <p>
            We will tailor the session to your use case, risk profile, and
            current operating model.
          </p>
          <ul className="plain-list">
            <li>30-minute working session</li>
            <li>Role-based workflow walkthrough</li>
            <li>Implementation plan discussion</li>
          </ul>
        </div>

        <div className="panel">
          <h2>Book your demo</h2>
          <RequestDemoForm />
        </div>
      </div>
    </section>
  );
}
