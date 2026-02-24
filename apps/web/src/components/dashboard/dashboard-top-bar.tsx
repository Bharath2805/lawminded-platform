"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type DashboardTopBarProps = {
  isAdmin: boolean;
};

export function DashboardTopBar({ isAdmin }: DashboardTopBarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const onBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/app");
  };

  const isActive = (href: string) => {
    if (href === "/app") {
      return pathname === "/app";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="dashboard-top-bar">
      <button type="button" className="btn ghost small" onClick={onBack}>
        Back
      </button>
      <div className="dashboard-top-links">
        <Link href="/" className={isActive("/") ? "active" : undefined}>
          Home
        </Link>
        <Link href="/app" className={isActive("/app") ? "active" : undefined}>
          Dashboard
        </Link>
        {isAdmin ? (
          <Link
            href="/admin"
            className={isActive("/admin") ? "active" : undefined}
          >
            Admin
          </Link>
        ) : null}
      </div>
    </div>
  );
}
