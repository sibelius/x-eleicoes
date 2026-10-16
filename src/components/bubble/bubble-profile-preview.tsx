import { useCallback, useEffect, useRef, useState } from "react";

const OPEN_DELAY = 500;
const CLOSE_DELAY = 150;
const CARD_WIDTH = 240;
const CARD_HEIGHT = 72;
const GAP = 8;

export interface BubbleProfile {
  id: string;
  name: string | null;
  username: string | null;
  avatar: string | null;
}

interface ProfilePreview {
  profile: BubbleProfile;
  anchor: DOMRect;
}

interface ProfilePreviewController {
  preview: ProfilePreview | null;
  open: (profile: BubbleProfile, target: Element, delay?: number) => void;
  close: () => void;
  closeSoon: () => void;
  keepOpen: () => void;
}

export function useBubbleProfilePreview(): ProfilePreviewController {
  const [preview, setPreview] = useState<ProfilePreview | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback((): void => {
    keepOpen();
    setPreview(null);
  }, [keepOpen]);
  const closeSoon = useCallback((): void => {
    keepOpen();
    timer.current = setTimeout(() => setPreview(null), CLOSE_DELAY);
  }, [keepOpen]);
  const open = useCallback((profile: BubbleProfile, target: Element, delay = OPEN_DELAY): void => {
    close();
    const show = (): void => {
      if (target.isConnected) setPreview({ profile, anchor: target.getBoundingClientRect() });
    };
    if (delay === 0) { show(); return; }
    timer.current = setTimeout(show, delay);
  }, [close]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("wheel", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("fullscreenchange", close);
    return () => {
      keepOpen();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("fullscreenchange", close);
    };
  }, [close, keepOpen]);

  return { preview, open, close, closeSoon, keepOpen };
}

interface BubbleProfilePreviewProps {
  id: string;
  preview: ProfilePreview | null;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function BubbleProfilePreview({ id, preview, onPointerEnter, onPointerLeave }: BubbleProfilePreviewProps): React.JSX.Element | null {
  if (!preview) return null;
  const { profile, anchor } = preview;
  const width = Math.min(CARD_WIDTH, window.innerWidth - GAP * 2);
  const left = Math.max(GAP, Math.min(anchor.left + anchor.width / 2 - width / 2, window.innerWidth - width - GAP));
  const top = anchor.top >= CARD_HEIGHT + GAP
    ? anchor.top - CARD_HEIGHT - GAP
    : Math.max(GAP, Math.min(anchor.bottom + GAP, window.innerHeight - CARD_HEIGHT - GAP));
  const displayName = profile.name?.trim() || profile.username || "Conta do X";
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <div
      id={id}
      role="tooltip"
      className="fixed z-50 flex min-h-18 items-center gap-3 rounded-xl border border-line bg-card p-3 text-sm text-fg shadow-lg"
      style={{ left, top, width }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {profile.avatar ? (
        // X avatar URLs are external and may change independently of the app.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar} alt="" width={40} height={40} className="size-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted font-semibold">{initials}</span>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{displayName}</p>
        {profile.username && <p className="truncate text-subtle">@{profile.username}</p>}
      </div>
    </div>
  );
}
