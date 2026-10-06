"use client";

/*
  Lands here from every auth email: ?token_hash=…&type=email|recovery&next=…
  Verified in the browser (per-visitor rate limits), and only once JavaScript runs, so mail scanners that
  pre-fetch links don't burn the single-use token.
*/

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { authMessage } from "@/lib/auth/errors";
import { safeNext } from "@/lib/auth/next";
import styles from "./auth.module.css";

const TYPES: EmailOtpType[] = ["email", "signup", "magiclink", "recovery", "email_change"];

export function ConfirmLink() {
  const router = useRouter();
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tokenHash = params.get("token_hash");
    const type = params.get("type") as EmailOtpType | null;
    const next = safeNext(params.get("next"));

    (async () => {
      if (!tokenHash || !type || !TYPES.includes(type)) {
        setError("الرابط ناقص أو غير صحيح. اطلب رابطاً جديداً.");
        return;
      }
      const { error } = await createClient().auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) {
        setError(authMessage(error));
        return;
      }
      router.replace(type === "recovery" ? "/auth/update-password" : next);
      router.refresh();
    })();
  }, [params, router]);

  if (error) {
    return (
      <>
        <p className={styles.error} role="alert">
          {error}
        </p>
        <Link className="ad-btn ad-btn--ghost ad-btn--block" href="/login">
          اذهب إلى الدخول
        </Link>
      </>
    );
  }
  return (
    <p className={styles.notice} role="status">
      جارٍ التحقق من الرابط…
    </p>
  );
}
