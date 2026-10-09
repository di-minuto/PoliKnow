"use client";

import { buttonClass } from "@/components/ui/styles";
import { signOut } from "@/app/(auth)/login/actions";
import { clearOfflinePages } from "./service-worker";

/** Cierra sesión y borra del dispositivo las páginas guardadas para usar sin conexión. */
export function SignOutButton() {
  return (
    <form
      action={async () => {
        await clearOfflinePages();
        await signOut();
      }}
      className="mt-4"
    >
      <button type="submit" className={buttonClass.secondary}>
        Cerrar sesión
      </button>
    </form>
  );
}
