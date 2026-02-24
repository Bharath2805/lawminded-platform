import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/logout-button";
import { DashboardNavLinks } from "@/components/dashboard/dashboard-nav-links";
import { DashboardTopBar } from "@/components/dashboard/dashboard-top-bar";
import { requireUser } from "@/lib/server-auth";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser("/app");
  const links = [
    { href: "/app", label: "Overview" },
    { href: "/app/assistant", label: "AI Assistant" },
    { href: "/app/resources", label: "Resources" },
    { href: "/app/billing", label: "Billing" },
    { href: "/app/settings", label: "Privacy & Settings" },
    ...(user.roles.includes("admin")
      ? [{ href: "/admin", label: "Admin Center" }]
      : []),
    { href: "/contact", label: "Help & Contact" },
  ];

  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar">
        <Link href="/" className="brand dashboard-brand">
          <Image
            src="/lawminded-logo.png"
            alt="LawMinded"
            width={32}
            height={32}
            className="brand-logo"
            priority
          />
          <span>LawMinded</span>
        </Link>
        <DashboardNavLinks links={links} />
        <div className="dashboard-user-box">
          <p className="dashboard-user-email">{user.email}</p>
          <LogoutButton className="btn ghost small" />
        </div>
      </aside>
      <main className="dashboard-main">
        <div className="shell">
          <DashboardTopBar isAdmin={user.roles.includes("admin")} />
        </div>
        {children}
      </main>
    </div>
  );
}
