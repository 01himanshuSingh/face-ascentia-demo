import { useState, type FormEvent } from "react";

export type LoginFormProps = {
  busy: boolean;
  error: string | null;
  notice: string | null;
  onSubmit: (employeeId: string, password: string) => Promise<void>;
};

export function LoginForm({ busy, error, notice, onSubmit }: LoginFormProps) {
  const [employeeId, setEmployeeId] = useState("ADMIN001");
  const [password, setPassword] = useState("changeme");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(employeeId.trim(), password);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#ccfbf1_0%,_transparent_55%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)]"
      />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200/80 bg-white/95 p-8 shadow-xl shadow-slate-900/5 backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">
          Face Auth
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Admin Portal
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Sign in to review pending employee registrations for your plant.
        </p>

        {notice ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {notice}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Employee ID
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              autoComplete="username"
              disabled={busy}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
            Password
            <input
              className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 disabled:bg-slate-50"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
