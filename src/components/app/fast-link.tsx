"use client";

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useRef, type ComponentProps } from "react";
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";

/**
 * Link that loads the whole next page as soon as the user shows intent —
 * pointer hover, keyboard focus or touch start — so the page is usually ready
 * by the time the click lands. Viewport prefetching is off by default (a table
 * of links would otherwise call the server once per row); pass `prefetch={null}`
 * to keep Next.js's default viewport prefetch for small, always-visible menus.
 */
const FastLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function FastLink(
  { href, prefetch = false, onMouseEnter, onFocus, onTouchStart, ...rest },
  ref,
) {
  const router = useRouter();
  const done = useRef(false);
  const warm = useCallback(() => {
    if (done.current || typeof href !== "string" || !href.startsWith("/") || href.startsWith("/api/")) return;
    done.current = true;
    router.prefetch(href, { kind: PrefetchKind.FULL });
    // Allow a fresh prefetch later; the router cache decides whether to reuse it.
    setTimeout(() => (done.current = false), 10_000);
  }, [href, router]);

  return (
    <NextLink
      ref={ref}
      href={href}
      prefetch={prefetch}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
});

export default FastLink;
