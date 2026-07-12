"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { actionErrorMessage } from "@/lib/action-lifecycle";
import { optionalStepCanSkip, validateStepContainer } from "@/lib/onboarding-wizard";
import type { ProfileFormState } from "@/lib/profile-save";
import { InlineActionError } from "@/components/inline-action-error";

type ProfileAction = (formData: FormData) => Promise<ProfileFormState>;
type ProfileFormMode = "edit" | "onboarding" | "contact_required";

export type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  optional?: boolean;
  content: ReactNode;
};

export function ProfileForm({
  action,
  children,
  variant,
  className,
  mode = "edit",
  skipHref,
  steps,
}: {
  action: ProfileAction;
  children: ReactNode;
  variant: "desktop" | "mobile";
  className?: string;
  mode?: ProfileFormMode;
  skipHref?: string;
  steps?: OnboardingStep[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const stepContainerRefs = useRef<(HTMLDivElement | null)[]>([]);

  const submitLabel =
    mode === "onboarding"
      ? "Continue to app"
      : mode === "contact_required"
        ? "Save and continue"
        : "Save changes";

  useEffect(() => {
    if (!steps) return;
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [currentStep, steps]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        setError(result?.error ?? null);
      } catch (actionError) {
        setError(
          actionErrorMessage(
            actionError,
            "We couldn't save your profile. Please try again.",
          ),
        );
      }
    });
  }

  function handleContinue() {
    if (!steps) return;
    const container = stepContainerRefs.current[currentStep];
    if (!validateStepContainer(container, setError)) return;
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  }

  function handleBack() {
    if (!steps || currentStep === 0) return;
    setError(null);
    setCurrentStep((step) => Math.max(0, step - 1));
  }

  function handleSkip() {
    if (!steps || !optionalStepCanSkip(steps[currentStep]?.optional)) return;
    setError(null);
    setCurrentStep((step) => Math.min(step + 1, steps.length - 1));
  }

  const errorMessage = (
    <InlineActionError
      id="profile-save-error"
      error={error}
      className={
        variant === "mobile"
          ? "mb-2 text-center text-[13px] font-bold text-red-600"
          : "text-sm font-semibold text-red-600"
      }
    />
  );

  const showSkip = mode === "contact_required" && skipHref;
  const isWizard = steps && steps.length > 0;
  const isLastStep = isWizard && currentStep === steps.length - 1;
  const isWelcomeStep = isWizard && currentStep === 0;
  const activeStep = isWizard ? steps[currentStep] : null;

  if (isWizard) {
    const cardPadding = variant === "mobile" ? "px-5 py-6" : "px-6 py-7";
    const titleClass =
      variant === "mobile"
        ? "text-[22px] font-extrabold tracking-tight text-ink"
        : "text-[26px] font-extrabold tracking-tight text-ink";
    const descriptionClass =
      variant === "mobile"
        ? "mt-2 text-[14px] font-medium leading-snug text-muted-warm"
        : "mt-2 text-sm font-medium leading-snug text-stone-600";
    const progressClass =
      variant === "mobile"
        ? "text-[12px] font-semibold text-muted-warm"
        : "text-xs font-semibold text-stone-500";
    const buttonPrimary =
      variant === "mobile"
        ? "h-[50px] w-full rounded-[14px] bg-brand-600 text-[15px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        : "min-h-11 w-full rounded-xl bg-brand-600 px-5 py-4 font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
    const buttonSecondary =
      variant === "mobile"
        ? "h-[50px] w-full rounded-[14px] border border-border bg-white text-[15px] font-bold text-ink transition hover:bg-stone-50 active:scale-[0.98]"
        : "min-h-11 w-full rounded-xl border border-[#e2ddd5] bg-white px-5 py-4 font-bold text-stone-700 transition hover:bg-stone-50 active:scale-[0.98]";
    const skipLinkClass =
      variant === "mobile"
        ? "inline-flex min-h-11 items-center justify-center text-[13px] font-medium text-muted-warm underline-offset-2 hover:text-brand-600 hover:underline"
        : "inline-flex min-h-11 items-center justify-center text-sm font-medium text-stone-500 underline-offset-2 hover:text-brand-600 hover:underline";

    return (
      <form
        onSubmit={submit}
        className={className}
        aria-busy={pending}
        aria-describedby={error ? "profile-save-error" : undefined}
      >
        {children}
        <div
          className={`mx-auto w-full max-w-[480px] rounded-xl border border-border-soft bg-white ${cardPadding}`}
        >
          <p aria-live="polite" className={progressClass}>
            Step {currentStep + 1} of {steps.length}
          </p>
          <h2
            ref={stepHeadingRef}
            tabIndex={-1}
            className={`mt-3 outline-none ${titleClass}`}
          >
            {activeStep?.title}
          </h2>
          <p className={descriptionClass}>{activeStep?.description}</p>

          <div className={variant === "mobile" ? "mt-5 space-y-0" : "mt-6 space-y-0"}>
            {steps.map((step, index) => (
              <div
                key={step.key}
                ref={(el) => {
                  stepContainerRefs.current[index] = el;
                }}
                hidden={index !== currentStep}
                className={step.content ? "space-y-4" : undefined}
              >
                {step.content}
              </div>
            ))}
          </div>

          <div className={variant === "mobile" ? "mt-6 space-y-3" : "mt-8 space-y-3"}>
            {errorMessage}
            <div className="flex flex-col gap-2.5">
              {isLastStep ? (
                <button
                  type="submit"
                  disabled={pending}
                  className={buttonPrimary}
                >
                  {pending ? "Saving..." : "Finish setup"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={pending}
                  className={buttonPrimary}
                >
                  {isWelcomeStep ? "Get started" : "Continue"}
                </button>
              )}
              <div className="flex gap-2.5">
                {currentStep > 0 && (
                  <button
                    type="button"
                    onClick={handleBack}
                    className={buttonSecondary}
                  >
                    Back
                  </button>
                )}
                {!isLastStep && optionalStepCanSkip(activeStep?.optional) && (
                  <button
                    type="button"
                    onClick={handleSkip}
                    className={`${buttonSecondary} flex-1`}
                  >
                    Skip
                  </button>
                )}
              </div>
            </div>
            {skipHref && (
              <div className="pt-1 text-center">
                <Link href={skipHref} className={skipLinkClass}>
                  Skip setup and browse rides
                </Link>
              </div>
            )}
          </div>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={submit}
      className={className}
      aria-busy={pending}
      aria-describedby={error ? "profile-save-error" : undefined}
    >
      {children}
      {variant === "desktop" ? (
        <>
          {errorMessage}
          <div className="space-y-3">
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 w-full rounded-xl bg-brand-600 px-5 py-4 font-bold text-white transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? "Saving..." : submitLabel}
            </button>
            {showSkip && (
              <div className="space-y-1 text-center">
                <Link
                  href={skipHref}
                  className="inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold text-brand-600 underline-offset-2 hover:underline"
                >
                  Keep browsing for now
                </Link>
                <p className="text-xs text-stone-500">
                  You can finish contact info later. We will ask again when you book, post, or message.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[440px] border-t border-border-soft bg-cream px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          {errorMessage}
          <button
            type="submit"
            disabled={pending}
            className="h-[54px] w-full rounded-[14px] bg-brand-600 text-[15px] font-bold text-white shadow-[0_14px_24px_-12px_rgba(166,83,41,0.7)] transition hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Saving..." : submitLabel}
          </button>
          {showSkip && (
            <div className="mt-2 space-y-1 text-center">
              <Link
                href={skipHref}
                className="inline-flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-brand-600 underline-offset-2 hover:underline"
              >
                Keep browsing for now
              </Link>
              <p className="text-[11px] text-muted-warm">
                You can finish contact info later. We will ask again when you book, post, or message.
              </p>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
