"use client";

import { useActionState } from "react";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/auth/actions";
import { InlineActionError } from "@/components/inline-action-error";
import {
  PendingActionButton,
  PendingActionGroup,
} from "@/components/pending-action-button";
import type { SignOutState } from "@/lib/sign-out";

type SignOutVariant = "desktop" | "mobile";

export function SignOutFormView({
  variant,
  state,
  formAction,
}: {
  variant: SignOutVariant;
  state: SignOutState;
  formAction: (formData: FormData) => void | Promise<void>;
}) {
  const mobile = variant === "mobile";
  const actionKey = mobile ? "mobile-profile-signout" : "profile-signout";
  const errorId = `${actionKey}-error`;

  return (
    <PendingActionGroup>
      <form
        action={formAction}
        className={
          mobile
            ? ""
            : "mt-8 border-t border-[#efece6] pt-5 text-center"
        }
      >
        <PendingActionButton
          actionKey={actionKey}
          pendingLabel="Signing out..."
          className={
            mobile
              ? "flex h-[46px] min-w-[46px] items-center justify-center rounded-[13px] bg-tint px-3 text-brand-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              : "text-sm text-stone-400 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          }
        >
          {mobile ? (
            <>
              <span className="sr-only">Sign out</span>
              <LogOut size={18} strokeWidth={2.2} aria-hidden />
            </>
          ) : (
            "Sign out"
          )}
        </PendingActionButton>
        <InlineActionError
          id={errorId}
          error={state?.error}
          className={
            mobile
              ? "mt-2 max-w-48 text-left text-xs font-semibold text-red-600"
              : "mt-2 text-sm font-semibold text-red-600"
          }
        />
      </form>
    </PendingActionGroup>
  );
}

export function SignOutForm({ variant }: { variant: SignOutVariant }) {
  const [state, formAction] = useActionState(signOutAction, null);
  return (
    <SignOutFormView
      variant={variant}
      state={state}
      formAction={formAction}
    />
  );
}
