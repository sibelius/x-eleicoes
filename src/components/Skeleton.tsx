// Shimmering placeholders shown while a page's data streams in.

export function Shimmer({ className = "" }: { className?: string }) {
  // Rounded by default; a rounded-* in className replaces it (both in one list wouldn't override).
  return <div aria-hidden className={`shimmer ${className.includes("rounded-") ? "" : "rounded-xl"} ${className}`} />;
}

/** Tally bar card, the bubble, then a grid of people: the shape of most pages here. */
export function PageSkeleton({ bubble = true, list = 6 }: { bubble?: boolean; list?: number }) {
  return (
    <div role="status" aria-label="Carregando" className="mt-6 space-y-4">
      <div className="rounded-2xl border border-line bg-card p-4">
        <Shimmer className="h-4 w-1/3" />
        <Shimmer className="mt-3 h-6 w-full rounded-full" />
        <Shimmer className="mt-2 h-3 w-1/2" />
      </div>
      {bubble && (
        <div className="rounded-2xl border border-line bg-card p-4">
          <Shimmer className="h-5 w-1/4" />
          <Shimmer className="mx-auto mt-4 aspect-square w-full max-w-md rounded-full" />
        </div>
      )}
      {list > 0 && <ListSkeleton rows={list} />}
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="grid gap-2 sm:grid-cols-2">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <Shimmer className="h-11 w-11 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1 space-y-2">
            <Shimmer className="h-3.5 w-2/3" />
            <Shimmer className="h-3 w-1/3" />
          </span>
        </li>
      ))}
    </ul>
  );
}
