"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import type { AuthUser } from "@/lib/client-api";

const marketingLinks = [
  { href: "/", label: "Home" },
  { href: "/solutions", label: "Solutions" },
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
  { href: "/contact", label: "Contact" },
];

type SiteHeaderProps = {
  currentUser?: AuthUser | null;
};

export function SiteHeader({ currentUser = null }: SiteHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const navId = "site-navigation";
  const isAdmin = Boolean(currentUser?.roles.includes("admin"));
  const isAuthenticated = Boolean(currentUser);

  const navLinks = [
    ...marketingLinks,
    ...(isAuthenticated ? [{ href: "/app", label: "Dashboard" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const onBack = () => {
    setOpen(false);

    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  };

  return (
    <header className="site-header">
      <div className="shell nav-shell">
        <Link href="/" className="brand">
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

        <button
          type="button"
          className="mobile-nav-toggle"
          aria-controls={navId}
          aria-expanded={open}
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Close" : "Menu"}
        </button>

        <nav id={navId} className={open ? "site-nav open" : "site-nav"}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isActive(link.href) ? "active" : undefined}
              aria-current={isActive(link.href) ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mobile-nav-actions">
            {pathname !== "/" ? (
              <button
                type="button"
                className="btn ghost small"
                onClick={onBack}
              >
                Back
              </button>
            ) : null}
            {isAuthenticated ? (
              <>
                <Link
                  href="/app"
                  className="btn primary small"
                  onClick={() => setOpen(false)}
                >
                  Open Dashboard
                </Link>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="btn secondary small"
                    onClick={() => setOpen(false)}
                  >
                    Admin Center
                  </Link>
                ) : null}
                <LogoutButton className="btn ghost small" />
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="btn ghost small"
                  onClick={() => setOpen(false)}
                >
                  Sign in
                </Link>
                <Link
                  href="/request-demo"
                  className="btn primary small"
                  onClick={() => setOpen(false)}
                >
                  Request Demo
                </Link>
              </>
            )}
          </div>
        </nav>

        <div className="nav-actions">
          {pathname !== "/" ? (
            <button type="button" className="btn ghost small" onClick={onBack}>
              Back
            </button>
          ) : null}
          {isAuthenticated ? (
            <>
              <Link href="/app" className="btn primary small">
                Open Dashboard
              </Link>
              {isAdmin ? (
                <Link href="/admin" className="btn secondary small">
                  Admin Center
                </Link>
              ) : null}
              <LogoutButton className="btn ghost small" />
            </>
          ) : (
            <>
              <Link href="/login" className="btn ghost small">
                Sign in
              </Link>
              <Link href="/request-demo" className="btn primary small">
                Request Demo
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
