import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { fetchCurrentUserServer } from "@/lib/server-auth";

export default async function LegalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await fetchCurrentUserServer();

  return (
    <div className="marketing-root">
      <SiteHeader currentUser={user} />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
