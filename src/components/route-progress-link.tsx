"use client";

import {
  forwardRef,
  useCallback,
  useRef,
  type ComponentProps,
  type ForwardedRef,
} from "react";
import NextLink from "next/link";
import { useRouteProgressStart } from "@/components/route-progress";
import {
  completeRouteProgressNavigation,
  shouldTrackNavigation,
} from "@/lib/route-progress-model";

type RouteProgressLinkProps = ComponentProps<typeof NextLink>;
type LinkNavigateEvent = Parameters<
  NonNullable<RouteProgressLinkProps["onNavigate"]>
>[0];

function assignRef(
  ref: ForwardedRef<HTMLAnchorElement>,
  node: HTMLAnchorElement | null,
) {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

export const RouteProgressLink = forwardRef<
  HTMLAnchorElement,
  RouteProgressLinkProps
>(function RouteProgressLink(
  { onClick, onNavigate, ...props },
  forwardedRef,
) {
  const start = useRouteProgressStart();
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const targetKeyRef = useRef<string | null>(null);
  const setRef = useCallback(
    (node: HTMLAnchorElement | null) => {
      anchorRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  const handleClick: NonNullable<RouteProgressLinkProps["onClick"]> = useCallback(
    (event) => {
      targetKeyRef.current = null;
      onClick?.(event);
      const anchor = anchorRef.current;
      if (!anchor) return;
      const decision = shouldTrackNavigation(
        {
          href: anchor.href,
          target: anchor.target,
          download: anchor.hasAttribute("download"),
        },
        event,
        new URL(window.location.href),
      );
      targetKeyRef.current = decision.targetKey;
    },
    [onClick],
  );

  const handleNavigate = useCallback(
    (event: LinkNavigateEvent) => {
      const targetKey = targetKeyRef.current;
      targetKeyRef.current = null;
      completeRouteProgressNavigation(
        {
          targetKey,
          onNavigate,
          start: start ?? (() => undefined),
        },
        event,
      );
    },
    [onNavigate, start],
  );

  return (
    <NextLink
      {...props}
      ref={setRef}
      onClick={handleClick}
      onNavigate={handleNavigate}
    />
  );
});
