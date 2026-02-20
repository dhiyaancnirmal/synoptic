import { Suspense } from "react";
import { PaymentsRouteClient } from "@/components/dashboard/routes/PaymentsRouteClient";

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentsRouteClient />
    </Suspense>
  );
}
