import { ImageResponse } from "next/og";
import { BubbleArt, OG, networkArt } from "@/lib/bubble-art";
import { bubbleVerdict, pct } from "@/lib/links";
import { getNetwork, getShare, resolveUser } from "@/lib/network";

export const alt = "De que lado está a minha rede do X";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const id = (await resolveUser(decodeURIComponent(handle)))?.id ?? "";
  const share = id ? await getShare(id) : null;
  const t = share?.tally ?? { lula: 0, bolsonaro: 0, total: 0 };
  const l = pct(t.lula, t.total);
  const b = t.total ? 100 - l : 0;
  const art = share ? await networkArt({ id, vote: share.vote, avatar: share.user.avatar }, (await getNetwork(id)).nodes) : [];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: OG.bg, color: OG.fg }}>
        <div style={{ display: "flex", flexDirection: "column", width: 500, paddingLeft: 64, paddingRight: 24 }}>
          <div style={{ fontSize: 34, color: OG.subtle }}>{`De que lado está a rede de @${share?.user.username ?? "?"}`}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, fontSize: 54, fontWeight: 800, lineHeight: 1.15, whiteSpace: "nowrap" }}>
            <span style={{ color: OG.lula }}>{`Vermelho ${l}%`}</span>
            <span style={{ color: OG.bolso }}>{`Verde ${b}%`}</span>
          </div>
          <div style={{ display: "flex", height: 28, marginTop: 28, borderRadius: 14, overflow: "hidden", background: OG.muted }}>
            <div style={{ width: `${l}%`, background: OG.lula }} />
            <div style={{ width: `${b}%`, background: OG.bolso }} />
          </div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 30, fontWeight: 800 }}>{bubbleVerdict(t).label}</div>
          <div style={{ marginTop: 12, fontSize: 28, color: OG.subtle }}>{`${t.total} escolhas na rede · E a sua rede?`}</div>
        </div>
        {art.length > 0 && <BubbleArt nodes={art} width={680} height={600} />}
      </div>
    ),
    size,
  );
}
