# 007 — Keep Public Job Pages Current

Status: DONE

## Outcome

Job list and detail pages refresh within 60 seconds. Application and
confirmation pages are never cached. Date-only fields render in UTC on both
server and browser.

## Implementation

- Shared route rules own 60-second list/detail caching and no-store form pages.
- A shared UTC formatter removes hydration and one-day date shifts.
- FactoryHQ careers data revalidates every 60 seconds in an isolated worktree.
- The existing FactoryHQ fallback link remains available when the careers
  service fails.

## Proof

Source and unit tests assert route rules, UTC rendering, FactoryHQ revalidation,
and fallback behavior. Browser coverage runs in UTC, Pacific, and Eastern zones.
