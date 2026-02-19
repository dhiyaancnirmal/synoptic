import { DashboardClient } from "@/components/dashboard/DashboardClient";

const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://testnet.kitescan.ai";

export default function DashboardPage() {
  return <DashboardClient explorerUrl={explorerUrl} />;
}
