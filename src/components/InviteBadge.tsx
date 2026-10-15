import { inviteBadge } from "@/lib/links";

export function InviteBadge({ invites, full = false }: { invites: number; full?: boolean }) {
  const b = inviteBadge(invites);
  if (!b) return null;
  return (
    <span
      title={`${b.label}: ${invites} pessoas entraram pelo link`}
      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold"
    >
      {b.emoji}
      {full && <span>{b.label}</span>}
    </span>
  );
}
