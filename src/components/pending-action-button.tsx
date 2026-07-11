"use client";

import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { useFormStatus } from "react-dom";

export type PendingActionState = { pendingKey: string | null };

export type PendingAction =
  | { type: "start"; key: string }
  | { type: "finish"; key: string };

export function pendingActionReducer(
  state: PendingActionState,
  action: PendingAction,
): PendingActionState {
  if (action.type === "start") {
    return state.pendingKey ? state : { pendingKey: action.key };
  }
  return state.pendingKey === action.key ? { pendingKey: null } : state;
}

const PendingActionContext = createContext<{
  state: PendingActionState;
  dispatch: React.Dispatch<PendingAction>;
} | null>(null);

export function PendingActionGroup({
  children,
  initialPendingKey = null,
}: {
  children: React.ReactNode;
  initialPendingKey?: string | null;
}) {
  const [state, dispatch] = useReducer(pendingActionReducer, {
    pendingKey: initialPendingKey,
  });

  return (
    <PendingActionContext.Provider value={{ state, dispatch }}>
      {children}
    </PendingActionContext.Provider>
  );
}

export function usePendingActionOpen() {
  const group = useContext(PendingActionContext);
  return group ? group.state.pendingKey !== null : false;
}

export function getPendingActionButtonView({
  actionKey,
  children,
  pending,
  pendingKey,
  pendingLabel,
}: {
  actionKey: string;
  children: React.ReactNode;
  pending: boolean;
  pendingKey: string | null;
  pendingLabel: string;
}) {
  const lockedByOther = pendingKey !== null && pendingKey !== actionKey;
  const isPending = pending || pendingKey === actionKey;
  return {
    disabled: lockedByOther || isPending,
    label: isPending ? pendingLabel : children,
    lockedByOther,
  };
}

export function getPendingActionClickDecision({
  defaultPrevented,
  formIsValid,
  lockedByOther,
}: {
  defaultPrevented: boolean;
  formIsValid: boolean;
  lockedByOther: boolean;
}) {
  if (lockedByOther) {
    return { preventDefault: true, start: false };
  }
  return {
    preventDefault: false,
    start: !defaultPrevented && formIsValid,
  };
}

export function PendingActionButtonPresentation({
  view,
  formAction,
  onClick,
  className,
}: {
  view: ReturnType<typeof getPendingActionButtonView>;
  formAction?: React.ComponentProps<"button">["formAction"];
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className: string;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      onClick={onClick}
      disabled={view.disabled}
      className={className}
    >
      {view.label}
    </button>
  );
}

export function PendingActionButton({
  actionKey,
  formAction,
  onClick,
  pendingLabel,
  className,
  children,
}: {
  actionKey: string;
  formAction?: React.ComponentProps<"button">["formAction"];
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  pendingLabel: string;
  className: string;
  children: React.ReactNode;
}) {
  const group = useContext(PendingActionContext);
  const { pending } = useFormStatus();
  const pendingKey = group?.state.pendingKey ?? null;
  const view = getPendingActionButtonView({
    actionKey,
    children,
    pending,
    pendingKey,
    pendingLabel,
  });
  const sawPending = useRef(false);

  useEffect(() => {
    if (pending) {
      sawPending.current = true;
    } else if (sawPending.current && pendingKey === actionKey) {
      sawPending.current = false;
      group?.dispatch({ type: "finish", key: actionKey });
    }
  }, [actionKey, group, pending, pendingKey]);

  return (
    <PendingActionButtonPresentation
      view={view}
      formAction={formAction}
      onClick={(event) => {
        if (view.lockedByOther) {
          const decision = getPendingActionClickDecision({
            defaultPrevented: event.defaultPrevented,
            formIsValid: true,
            lockedByOther: true,
          });
          if (decision.preventDefault) event.preventDefault();
          return;
        }

        onClick?.(event);
        const decision = getPendingActionClickDecision({
          defaultPrevented: event.defaultPrevented,
          formIsValid: event.currentTarget.form?.checkValidity() ?? true,
          lockedByOther: false,
        });
        if (decision.preventDefault) event.preventDefault();
        if (decision.start) group?.dispatch({ type: "start", key: actionKey });
      }}
      className={className}
    />
  );
}
