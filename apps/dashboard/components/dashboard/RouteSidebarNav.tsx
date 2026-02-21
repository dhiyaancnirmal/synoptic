"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/overview", label: "Overview" },
  { href: "/execute", label: "Execute" },
  { href: "/evidence", label: "Evidence" }
];

interface RouteSidebarNavProps {
  apiHealth: string;
  connectionStatus: string;
}

export function RouteSidebarNav({ apiHealth, connectionStatus }: RouteSidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside className="dash-sidebar">
      <div>
        <Link href="/" className="logo-font dash-logo-s">
          S
        </Link>
        <p className="pixel-text dash-sidebar-label">Synoptic</p>
      </div>

      <nav className="dash-tab-list" aria-label="Primary">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`dash-tab ${pathname === link.href ? "active" : ""}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="dash-sidebar-foot">
        <p className="pixel-text">Kite Testnet 2368</p>
        <p className={`dash-health ${apiHealth === "ok" ? "ok" : "warn"}`}>API {apiHealth}</p>
        <p className={`dash-health ${connectionStatus === "connected" ? "ok" : "warn"}`}>
          WS {connectionStatus}
        </p>
      </div>
    </aside>
  );
}
