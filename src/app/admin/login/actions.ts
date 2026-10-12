"use server";

import { redirect } from "next/navigation";
import {
  authenticateAdmin,
  isAdminAuthConfigured,
  setAdminSessionCookie,
} from "@/lib/auth";

/*
 * Server Action wired to the login form with `action={loginAdmin}`. The form is
 * a plain server-rendered <form>, so it works without client JavaScript.
 * Errors are reported by redirecting back to the login page with an `error`
 * code that the Server Component reads from `searchParams`.
 */
export async function loginAdmin(formData: FormData): Promise<void> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!isAdminAuthConfigured()) {
    console.error(
      "Admin login rejected: ADMIN_USER, ADMIN_PASSWORD_HASH or SESSION_SECRET is not configured.",
    );
    redirect("/admin/login?error=config");
  }

  if (!authenticateAdmin(username, password)) {
    redirect("/admin/login?error=credentials");
  }

  await setAdminSessionCookie(username);
  redirect("/admin");
}
