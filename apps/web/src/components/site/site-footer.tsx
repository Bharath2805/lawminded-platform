import Link from "next/link";
import { NewsletterForm } from "../forms/newsletter-form";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <h3>LawMinded</h3>
          <p>
            AI governance platform for legal, product, and engineering teams
            implementing EU AI Act controls.
          </p>
          <p className="muted">
            Enterprise-grade workflows, documentation standards, and audit-ready
            evidence.
          </p>
        </div>

        <div>
          <h4>Company</h4>
          <ul>
            <li>
              <Link href="/about">About</Link>
            </li>
            <li>
              <Link href="/solutions">Solutions</Link>
            </li>
            <li>
              <Link href="/features">Features</Link>
            </li>
            <li>
              <Link href="/pricing">Pricing</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4>Legal</h4>
          <ul>
            <li>
              <Link href="/privacy">Privacy Policy</Link>
            </li>
            <li>
              <Link href="/terms">Terms of Service</Link>
            </li>
            <li>
              <Link href="/cookie-policy">Cookie Policy</Link>
            </li>
          </ul>
        </div>

        <div>
          <h4>Stay Informed</h4>
          <p>Receive product updates and practical regulatory briefings.</p>
          <NewsletterForm compact />
        </div>
      </div>
    </footer>
  );
}
