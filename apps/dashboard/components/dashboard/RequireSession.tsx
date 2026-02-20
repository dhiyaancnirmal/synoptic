"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { ensureDashboardSessionToken } from "@/lib/api/client";

interface RequireSessionProps {
  children: ReactNode;
}

export function RequireSession({ children }: RequireSessionProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    async function ensure(): Promise<void> {
      try {
        await ensureDashboardSessionToken();
        if (!cancelled) setReady(true);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Authentication required");
        }
      }
    }

    void ensure();
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready) return <>{children}</>;

  return (
    <div className="dash-shell">
      <main className="dash-main">
        <article className="panel-state panel-state-error">
          <p className="pixel-text">auth</p>
          <h4>Session required</h4>
          <p>{error ?? "Checking session"}</p>
          <p>
            <Link href="/login" className="footer-link">
              Open login
            </Link>
          </p>
        </article>
      </main>
    </div>
  );
}
