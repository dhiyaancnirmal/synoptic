"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/overview", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/trading", label: "Trading" },
  { href: "/payments", label: "Payments" },
  { href: "/marketplace", label: "Marketplace" }
];

interface RouteSidebarNavProps {
  apiHealth: string;
  connectionStatus: string;
}

export function RouteSidebarNav({ apiHealth, connectionStatus }: RouteSidebarNavProps) {
  const pathname = usePathname();
  const isHealthy = apiHealth === "ok" && connectionStatus === "connected";

  function isActivePath(href: string): boolean {
    if (pathname === href) return true;
    if (href === "/overview" && pathname === "/cockpit") return true;
    return pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-brand">
        <Link href="/" className="logo-font dash-logo-s">
          S
        </Link>
        <p className="pixel-text dash-sidebar-label">synoptic</p>
      </div>

      <nav className="dash-tab-list" aria-label="Primary">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`dash-tab ${isActivePath(link.href) ? "active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="dash-sidebar-foot">
        <p className="pixel-text">Network 2368 / 10143</p>
        <p className={`dash-health ${isHealthy ? "ok" : "warn"}`}>
          API {apiHealth} · WS {connectionStatus}
        </p>
      </div>
    </aside>
  );
}
