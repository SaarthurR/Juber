"use client";

import { createContext, useContext } from "react";

export type DemoRuntimeValue = {
  enabled: boolean;
  actorId: string | null;
  revision: number | null;
};

const DemoRuntimeContext = createContext<DemoRuntimeValue>({
  enabled: false,
  actorId: null,
  revision: null,
});

export function DemoRuntimeProvider({
  value,
  children,
}: {
  value: DemoRuntimeValue;
  children: React.ReactNode;
}) {
  return <DemoRuntimeContext.Provider value={value}>{children}</DemoRuntimeContext.Provider>;
}

export function useDemoRuntime() {
  return useContext(DemoRuntimeContext);
}
