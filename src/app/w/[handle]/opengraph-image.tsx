import { ImageResponse } from "next/og";
import { OG, inlineAvatar } from "@/lib/bubble-art";
import { bubbleVerdict, pct } from "@/lib/links";
import { getShare, resolveUser } from "@/lib/network";
import { getBridge, getTwins, getWrapped } from "@/lib/social";

export const alt = "Retrospectiva da bolha";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const id = (await resolveUser(decodeURIComponent(handle)))?.id ?? "";
  const [share, w, twins, bridge] = id
    ? await Promise.all([getShare(id), getWrapped(id), getTwins(id), getBridge(id)])
    : [null, null, null, null];
  const t = w?.tally ?? { red: 0, green: 0, total: 0 };
  const l = pct(t.red, t.total);
  const avatar = await inlineAvatar(share?.user.avatar, "_400x400");
  const majority = t.red >= t.green ? OG.red : OG.green;
  const stat = (big: string, small: string, color: string = OG.fg) => (
    <div style={{ display: "flex", flexDirection: "column", width: 340, padding: 24, borderRadius: 24, background: OG.muted }}>
      <div style={{ fontSize: 56, fontWeight: 800, color }}>{big}</div>
      <div style={{ fontSize: 24, color: OG.subtle, marginTop: 4 }}>{small}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: 56, background: OG.bg, color: OG.fg }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {avatar && (
            // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
            <img src={avatar} alt="" width={96} height={96} style={{ borderRadius: 48, marginRight: 24 }} />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, color: OG.subtle }}>Retrospectiva da bolha</div>
            <div style={{ fontSize: 56, fontWeight: 800 }}>{`@${share?.user.username ?? handle}`}</div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 44, fontWeight: 800 }}>{bubbleVerdict(t).label}</div>
        <div style={{ display: "flex", height: 24, marginTop: 16, borderRadius: 12, overflow: "hidden", background: OG.muted }}>
          <div style={{ width: `${l}%`, background: OG.red }} />
          <div style={{ width: `${t.total ? 100 - l : 0}%`, background: OG.green }} />
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 32 }}>
          {stat(`${w?.closed ?? 0}%`, `de um lado só · mais fechada que ${w?.percentile ?? 0}%`, majority)}
          {twins?.twin
            ? stat(`@${twins.twin.username}`.slice(0, 14), "gêmeo de bolha")
            : stat(`${w?.invites ?? 0}`, "entraram pelo link")}
          {bridge
            ? stat(`${bridge.steps} ${bridge.steps === 1 ? "passo" : "passos"}`, "até o outro lado")
            : stat(`${w?.views ?? 0}`, "viram a bolha")}
        </div>
      </div>
    ),
    size,
  );
}
