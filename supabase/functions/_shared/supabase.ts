import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "", {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function requireUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization) {
    throw new HttpError("Missing Authorization header", 401);
  }

  const client = serviceClient();
  const token = authorization.replace(/^Bearer\s+/i, "");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError(error?.message || "Invalid session", 401);
  }

  await requireAllowlisted(client, data.user);
  return { client, user: data.user };
}

export async function requireAllowlisted(client: ReturnType<typeof serviceClient>, user: User) {
  const email = user.email?.toLowerCase();
  if (!email) {
    throw new HttpError("Signed-in Google account has no email", 403);
  }

  const { data, error } = await client.from("tester_allowlist").select("email").ilike("email", email).eq("active", true).maybeSingle();
  if (error) {
    throw new HttpError(error.message, 500);
  }
  if (!data) {
    throw new HttpError("This Google account is not on the LifeTrac tester allowlist", 403);
  }
}

export class HttpError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}
