import { createWebAccountDeletion } from "@/lib/offline/web-account-delete";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { deleteOwnAccount } from "@/lib/data/account";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return createWebAccountDeletion({
    async authorize() {
      const user = await getCurrentUser();
      if (!user) return null;
      const db = await createClient();
      return {
        userId: user.id,
        role: user.role,
        remove: () => deleteOwnAccount(db),
        signOut: () => db.auth.signOut({ scope: "local" }),
      };
    },
  })(request);
}
