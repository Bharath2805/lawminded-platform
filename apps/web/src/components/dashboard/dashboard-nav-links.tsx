"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type DashboardLink = {
  href: string;
  label: string;
};

type DashboardNavLinksProps = {
  links: DashboardLink[];
};

export function DashboardNavLinks({ links }: DashboardNavLinksProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/app") {
      return pathname === "/app";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={isActive(link.href) ? "active" : undefined}
          aria-current={isActive(link.href) ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
