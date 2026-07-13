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

export function getPendingActionTransition(wasPending: boolean, pending: boolean) {
  if (!wasPending && pending) return "start";
  if (wasPending && !pending) return "finish";
  return null;
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
  const groupDispatch = group?.dispatch;
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
    const transition = getPendingActionTransition(sawPending.current, pending);
    sawPending.current = pending;
    if (transition) groupDispatch?.({ type: transition, key: actionKey });
  }, [actionKey, groupDispatch, pending]);

  useEffect(
    () => () => {
      groupDispatch?.({ type: "finish", key: actionKey });
    },
    [actionKey, groupDispatch],
  );

  return (
    <PendingActionButtonPresentation
      view={view}
      formAction={formAction}
      onClick={onClick}
      className={className}
    />
  );
}
