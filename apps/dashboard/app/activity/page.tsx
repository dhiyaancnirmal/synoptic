import { Suspense } from "react";
import { ActivityRouteClient } from "@/components/dashboard/routes/ActivityRouteClient";

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityRouteClient />
    </Suspense>
  );
}
