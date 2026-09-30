"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/i18n/context";
import Toast from "@/components/Toast";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const closeToast = useCallback(() => setToast(null), []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (isSignup) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        setToast({ message: error.message, type: "error" });
      } else {
        setMessage(t.login.accountCreated);
        setToast({ message: t.login.accountCreated, type: "success" });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
        setToast({ message: error.message, type: "error" });
      } else {
        setMessage(t.login.loginSuccess);
        setToast({ message: t.login.loginSuccess, type: "success" });
        router.push("/");
        router.refresh();
      }
    }

    setLoading(false);
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
        {isSignup ? t.login.createAccount : t.login.welcomeBack}
      </h1>

      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        {isSignup
          ? t.login.createAccountDesc
          : t.login.loginDesc}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div>
          <label className="text-sm font-medium">{t.login.email}</label>

          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-300 p-3 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder={t.login.emailPlaceholder}
          />
        </div>

        <div>
          <label className="text-sm font-medium">{t.login.password}</label>

          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-300 p-3 dark:border-zinc-700 dark:bg-zinc-900"
            placeholder={t.login.passwordPlaceholder}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-600 px-4 py-3 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {loading
            ? t.common.pleaseWait
            : isSignup
            ? t.login.createAccountBtn
            : t.login.loginBtn}
        </button>
      </form>

      {message && (
        <p className="mt-5 text-sm text-zinc-600 dark:text-zinc-400">
          {message}
        </p>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}

      <button
        onClick={() => {
          setIsSignup(!isSignup);
          setMessage("");
        }}
        className="mt-6 text-sm font-medium text-teal-600 hover:underline"
      >
        {isSignup
          ? t.login.switchToLogin
          : t.login.switchToSignup}
      </button>
    </div>
  );
}
