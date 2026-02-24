import Link from "next/link";
import { NewsletterForm } from "@/components/forms/newsletter-form";
import { FeatureSections } from "@/components/site/feature-sections";
import { Hero } from "@/components/site/hero";
import { WhyItMatters } from "@/components/site/why-it-matters";
import { AICards } from "@/components/site/ai-cards";
import { Team } from "@/components/site/team";
import { HomeAssistantTrial } from "@/components/site/home-assistant-trial";

export default function HomePage() {
  return (
    <>
      <Hero />
      <HomeAssistantTrial enabled />
      <WhyItMatters />
      <FeatureSections />
      <AICards />
      <Team />

      <section className="section home-resource-section">
        <div className="shell">
          <div className="section-head section-head-center">
            <p className="eyebrow">Knowledge Library</p>
            <h2>Guides and templates for implementation teams.</h2>
          </div>

          <div className="home-resource-grid">
            <article className="resource-card home-resource-card">
              <h3>Executive Summary</h3>
              <p>
                A concise briefing on EU AI Act impact, governance priorities,
                and operating implications.
              </p>
              <div className="home-resource-actions">
                <Link
                  href="/resources"
                  className="btn secondary small w-full justify-center"
                >
                  View Summary
                </Link>
              </div>
            </article>

            <article className="resource-card home-resource-card">
              <h3>Compliance Timeline</h3>
              <p>
                A practical timeline of major EU AI Act milestones and
                implementation checkpoints.
              </p>
              <div className="home-resource-actions">
                <Link
                  href="/resources"
                  className="btn secondary small w-full justify-center"
                >
                  View Timeline
                </Link>
              </div>
            </article>

            <article className="resource-card home-resource-card">
              <h3>Z-Inspection®</h3>
              <p>
                Holistic AI assessment methodology for trustworthy, robust, and
                responsible systems.
              </p>
              <div className="home-resource-actions">
                <Link
                  href="https://z-inspection.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn secondary small w-full justify-center"
                >
                  Visit z-inspection.org
                </Link>
              </div>
            </article>
          </div>

          <div className="home-newsletter-band">
            <div className="home-newsletter-copy">
              <h3>Stay Updated</h3>
              <p>
                Receive product updates and practical EU AI Act implementation
                guidance.
              </p>
            </div>
            <div className="home-newsletter-form">
              <NewsletterForm />
            </div>
          </div>
        </div>
      </section>

      <section className="section cta-band">
        <div className="shell cta-inner">
          <div>
            <p className="eyebrow">Next Step</p>
            <h2>See LawMinded in a workflow tailored to your use case.</h2>
          </div>
          <Link href="/request-demo" className="btn primary">
            Book a Demo
          </Link>
        </div>
      </section>
    </>
  );
}
