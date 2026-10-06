import type { AuthFailure } from "@/lib/auth/errors";
import { whatsappChatUrl } from "@/lib/whatsapp";
import styles from "./auth.module.css";

/** An auth error. When the email couldn't be sent, the sentence ends with a WhatsApp link to the salon. */
export function AuthAlert({ error }: { error: AuthFailure }) {
  return (
    <p className={styles.error} role="alert">
      {error.message}
      {error.contact && (
        <>
          {" "}
          <a className={styles.inlineLink} href={whatsappChatUrl()} target="_blank" rel="noopener noreferrer">
            تواصل معنا على واتساب
          </a>
          .
        </>
      )}
    </p>
  );
}
