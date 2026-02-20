import { Suspense } from "react";
import { TradingRouteClient } from "@/components/dashboard/routes/TradingRouteClient";

export default function TradingPage() {
  return (
    <Suspense fallback={null}>
      <TradingRouteClient />
    </Suspense>
  );
}
