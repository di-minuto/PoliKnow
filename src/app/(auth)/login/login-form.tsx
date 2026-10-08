"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthFormState } from "./actions";

const initialState: AuthFormState = {};

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signingIn] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, initialState);

  const isSignIn = mode === "signin";
  const state = isSignIn ? signInState : signUpState;
  const pending = isSignIn ? signingIn : signingUp;

  return (
    <form action={isSignIn ? signInAction : signUpAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          minLength={8}
          required
          className="rounded-lg border border-border bg-surface px-3 py-2.5 text-base"
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Un momento…" : isSignIn ? "Entrar" : "Crear cuenta"}
      </button>

      <button
        type="button"
        onClick={() => setMode(isSignIn ? "signup" : "signin")}
        className="text-sm text-muted underline-offset-4 hover:underline"
      >
        {isSignIn ? "¿Primera vez? Crea tu cuenta" : "Ya tengo cuenta"}
      </button>
    </form>
  );
}
