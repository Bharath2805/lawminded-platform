import Link from "next/link";
import { Linkedin, Mail } from "lucide-react";

const teamMembers = [
  {
    name: "Miglena Dimitrova",
    role: "Chief Executive Officer",
    linkedin: "https://www.linkedin.com/in/miglena-dimitrova/",
    initials: "MD",
    image: null,
  },
  {
    name: "Alexander Iliev",
    role: "Chief Technical Officer",
    linkedin: "https://www.linkedin.com/in/ailiev/",
    initials: "AI",
    image: null,
  },
  {
    name: "Roumen Nikolov",
    role: "Chief Research Officer",
    linkedin: "https://www.linkedin.com/in/roumen-nikolov-a4b403130/",
    initials: "RN",
    image: null,
  },
  {
    name: "Velichka Ivanova",
    role: "Chief Administrative Officer",
    linkedin: "https://www.linkedin.com/in/velichka-ivanova-b2a426378/",
    initials: "VI",
    image: null,
  },
];

export function Team() {
  return (
    <section className="section team-section" id="about">
      <div className="shell">
        <div className="section-head section-head-center team-head">
          <p className="eyebrow">Leadership</p>
          <h2>Meet the Team</h2>
          <p className="lead">
            LawMinded combines legal, technical, and research leadership to
            deliver practical EU AI Act execution at enterprise quality.
          </p>
        </div>

        <div className="card-grid four team-grid">
          {teamMembers.map((member) => (
            <article
              key={member.name}
              className="team-member-card feature-card"
            >
              <div className="team-avatar-wrap">
                <div className="team-avatar" aria-hidden>
                  {member.initials}
                </div>
              </div>

              <div>
                <h3>{member.name}</h3>
                <p className="team-role">{member.role}</p>

                <Link
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn ghost small w-full justify-center"
                >
                  <Linkedin size={16} />
                  <span>View Profile</span>
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="team-contact">
          <h3>Contact</h3>
          <div className="team-contact-actions">
            <Link href="mailto:miglena@lawminded.ai" className="btn secondary">
              <Mail size={16} />
              miglena@lawminded.ai
            </Link>
            <Link
              href="https://www.linkedin.com/company/lawminded-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="btn secondary"
            >
              <Linkedin size={16} />
              LawMinded on LinkedIn
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
