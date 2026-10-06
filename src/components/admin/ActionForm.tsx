"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/admin/errors";

type Props = {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  /** The button; the success message comes back from the action in the same words, done («حفظ» → «حُفظ»). */
  submit: string;
  pendingLabel?: string;
  variant?: "primary" | "ghost";
  className?: string;
  /** Extra buttons or text beside the submit button. */
  aside?: ReactNode;
};

/** One small admin form: its fields, one button, and its own result line (status on success, alert on error). */
export function ActionForm({ action, children, submit, pendingLabel = "جارٍ الحفظ…", variant = "primary", className, aside }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {children}
      <div className="ad-form-actions">
        <button type="submit" className={`ad-btn ad-btn--${variant}`} disabled={pending}>
          {pending ? pendingLabel : submit}
        </button>
        {aside}
      </div>
      {state && (
        <p className={`ad-notice ${state.ok ? "ad-notice--ok" : "ad-notice--error"}`} role={state.ok ? "status" : "alert"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
