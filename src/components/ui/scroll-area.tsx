import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";

import { cn } from "@/lib/utils";

/**
 * `fitWidth`: lay the content out at the viewport's width, not its content's.
 *
 * Radix renders the viewport's child as `display: table; min-width: 100%`, so
 * a vertical list grows to its longest row instead of truncating: `min-w-0` +
 * `truncate` never bite, and whatever sits at the row's right end (a delete
 * button) lands past the edge, clipped and unreachable. Three lists hit it one
 * by one — ProjectRail (nordbrygg, 2026-09-22), the wiki search, and /chat's
 * conversation history (synclairvision, 2026-10-04, after a first fix that
 * only moved the button). Each carried its own `[&>[data-radix-scroll-area-
 * viewport]>div]:!block` hack; this prop is the one place. Leave it off for
 * content that is meant to scroll sideways (a wide table): there the table
 * layout is what lets it be wider than the viewport.
 */
const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & { fitWidth?: boolean }
>(({ className, children, fitWidth = false, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn("relative overflow-hidden", className)} {...props}>
    <ScrollAreaPrimitive.Viewport
      className={cn("h-full w-full rounded-[inherit]", fitWidth && "[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0")}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
