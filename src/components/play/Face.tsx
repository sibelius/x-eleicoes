/** A round profile photo, or a grey disc when there is none; `vote` draws the side's ring. */
export function Face({ src, size = 28, vote }: { src: string | null; size?: number; vote?: "red" | "green" | null }) {
  const ring = vote ? { boxShadow: `0 0 0 2px var(--${vote})` } : undefined;
  return src ? (
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full" style={{ width: size, height: size, ...ring }} />
  ) : (
    <span className="inline-block shrink-0 rounded-full bg-muted" style={{ width: size, height: size, ...ring }} />
  );
}
