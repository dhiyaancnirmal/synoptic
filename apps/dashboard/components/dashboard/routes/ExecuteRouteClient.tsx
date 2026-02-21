"use client";

import { Suspense } from "react";
import { TradingRouteClient } from "./TradingRouteClient";

export function ExecuteRouteClient() {
  return (
    <Suspense fallback={null}>
      <TradingRouteClient />
    </Suspense>
  );
}

