import { redirect } from "next/navigation";

import { DEFAULT_AFTER_SIGN_IN, LOGIN_PATH } from "@/lib/auth/routes";
import { getUser } from "@/lib/auth/session";

/** `/` has no screen of its own: Today when signed in, otherwise sign-in. */
export default async function Home() {
  redirect((await getUser()) ? DEFAULT_AFTER_SIGN_IN : LOGIN_PATH);
}
