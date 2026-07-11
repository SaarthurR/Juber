"use client";

import { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { useFormStatus } from "react-dom";

export type PendingActionState = { pendingKey: string | null };

export type PendingAction =
  | { type: "start"; key: string }
  | { type: "finish"; key: string };

const initialState: PendingActionState = { pendingKey: null };

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

export function PendingActionGroup({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(pendingActionReducer, initialState);

  return (
    <PendingActionContext.Provider value={{ state, dispatch }}>
      {children}
    </PendingActionContext.Provider>
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
  const lockedByOther = pendingKey !== null && pendingKey !== actionKey;
  const isPending = pending || pendingKey === actionKey;
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
    <button
      type="submit"
      formAction={formAction}
      onClick={(event) => {
        if (lockedByOther) {
          event.preventDefault();
          return;
        }
        group?.dispatch({ type: "start", key: actionKey });
        onClick?.(event);
      }}
      disabled={lockedByOther || isPending}
      className={className}
    >
      {isPending ? pendingLabel : children}
    </button>
  );
}
