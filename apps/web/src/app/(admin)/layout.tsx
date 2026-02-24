import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { LogoutButton } from "@/components/auth/logout-button";
import { requireAdmin } from "@/lib/server-auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAdmin("/admin");

  return (
    <div className="marketing-root">
      <SiteHeader currentUser={user} />
      <main>
        <section className="section">
          <div className="shell admin-toolbar">
            <p className="muted">
              Signed in as <strong>{user.email}</strong> with admin access
            </p>
            <LogoutButton className="btn ghost small" />
          </div>
        </section>
        {children}
      </main>
    </div>
  );
}
