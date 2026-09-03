import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
  clearSession,
  isAdminApiError,
  loadStoredSession,
  login,
  type AdminSession,
} from "../api/adminApi";
import { useToast } from "../components/toast/ToastProvider";
import { formatAdminError } from "../lib/formatAdminError";
import { adminQueryKeys } from "../lib/queryKeys";

export type AuthView = "bootstrap" | "login" | "dashboard";

export function useAdminSession() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [view, setView] = useState<AuthView>("bootstrap");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredSession();
    setSession(stored);
    setView(stored ? "dashboard" : "login");
  }, []);

  const signOut = useCallback(
    (notice?: string) => {
      clearSession();
      queryClient.removeQueries({ queryKey: adminQueryKeys.all });
      setSession(null);
      setView("login");
      setSessionNotice(notice ?? null);
      if (notice) {
        toast.info("Signed out", notice);
      }
    },
    [queryClient, toast],
  );

  const loginMutation = useMutation({
    mutationFn: ({
      employeeId,
      password,
    }: {
      employeeId: string;
      password: string;
    }) => login(employeeId, password),
    onMutate: () => {
      setLoginError(null);
      setSessionNotice(null);
    },
    onSuccess: (nextSession) => {
      setSession(nextSession);
      setView("dashboard");
      toast.success("Signed in", `Welcome, ${nextSession.employeeId}`);
    },
    onError: (error) => {
      const formatted = formatAdminError(
        error,
        "Sign in failed. Check backend is running.",
      );
      setLoginError(formatted.title);
      toast.error(formatted.title, formatted.description);
    },
  });

  const signIn = useCallback(
    async (employeeId: string, password: string) => {
      await loginMutation.mutateAsync({ employeeId, password });
    },
    [loginMutation],
  );

  const handleAuthFailure = useCallback(
    (error: unknown) => {
      if (!isAdminApiError(error)) {
        return false;
      }
      if (
        error.httpStatus === 401 ||
        error.code === "SESSION_EXPIRED" ||
        error.code === "UNAUTHORIZED"
      ) {
        signOut("Session expired. Sign in again.");
        return true;
      }
      return false;
    },
    [signOut],
  );

  return {
    session,
    view,
    loginBusy: loginMutation.isPending,
    loginError,
    sessionNotice,
    signIn,
    signOut,
    handleAuthFailure,
  };
}
