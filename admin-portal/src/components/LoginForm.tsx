import { useState, type FormEvent } from "react";

import { BrandLogo } from "./BrandLogo";

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
    <div className="flex min-h-screen items-center justify-center bg-white px-5 py-12 sm:px-6">
      <div className="w-full max-w-[22rem]">
        <header className="mb-10">
          <BrandLogo size="lg" productLabel="Admin Portal" />
        </header>

        {notice ? (
          <p
            role="status"
            className="mb-6 rounded-lg border border-secondary/40 bg-[#fff8e6] px-3 py-2.5 text-center text-sm text-[#7a5c00]"
          >
            {notice}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label
            htmlFor="admin-employee-id"
            className="flex flex-col gap-1.5 text-sm font-medium text-text"
          >
            Employee ID
            <input
              id="admin-employee-id"
              name="employeeId"
              className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-base text-text outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              placeholder="Enter Employee ID"
              autoComplete="username"
              spellCheck={false}
              disabled={busy}
            />
          </label>

          <label
            htmlFor="admin-password"
            className="flex flex-col gap-1.5 text-sm font-medium text-text"
          >
            Password
            <input
              id="admin-password"
              name="password"
              className="h-11 w-full rounded-lg border border-border bg-background px-3.5 text-base text-text outline-none transition placeholder:text-text-muted/70 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              disabled={busy}
            />
          </label>

          {error ? (
            <p role="alert" className="text-center text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
