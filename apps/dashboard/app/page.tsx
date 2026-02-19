import { pingApi } from "../lib/api";

export default async function HomePage() {
  const health = await pingApi();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-6 py-16">
      <h1 className="logo-font text-4xl tracking-tight">Synoptic</h1>
      <p className="text-sm uppercase tracking-[0.2em] text-slate-600">Monorepo Bootstrap Shell</p>
      <section className="rounded-xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold">API Connectivity Placeholder</h2>
        <p className="mt-2 text-sm text-slate-700">Health check: {health}</p>
      </section>
    </main>
  );
}
