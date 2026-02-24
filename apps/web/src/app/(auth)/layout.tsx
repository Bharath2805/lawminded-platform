import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site/site-header";
import { fetchCurrentUserServer } from "@/lib/server-auth";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await fetchCurrentUserServer();

  return (
    <div className="marketing-root">
      <SiteHeader currentUser={user} />
      <main>{children}</main>
    </div>
  );
}
