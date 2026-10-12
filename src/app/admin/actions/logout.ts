"use server";

import { redirect } from "next/navigation";
import { clearAdminSessionCookie } from "@/lib/auth";

/** Clears the session cookie server-side and returns to the login page. */
export async function logoutAdmin(): Promise<void> {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}
