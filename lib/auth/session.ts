import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";

export interface CurrentUser {
  id: string;
  email?: string | null;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthRequiredError";
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new AuthRequiredError();
  }

  return user;
}

export async function syncAppUser(user: CurrentUser): Promise<void> {
  await getDb()
    .insertInto("app_users")
    .values({
      id: user.id,
      email: user.email ?? null,
      auth_provider: "supabase",
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        email: user.email ?? null,
        auth_provider: "supabase",
        updated_at: new Date().toISOString(),
      }),
    )
    .execute();
}

export async function requireSyncedUser(): Promise<CurrentUser> {
  const user = await requireUser();
  await syncAppUser(user);
  return user;
}
