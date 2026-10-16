import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { BubbleArt, OG, networkArt } from "@/lib/bubble-art";
import { bubbleVerdict, pct, sharePath } from "@/lib/links";
import { getNetwork, getShare, resolveUser } from "@/lib/network";
import { appUrl } from "@/lib/session";
import { shortLink } from "@/lib/share-links";

const W = 1080;
const H = 1920;

/** A 1080×1920 Stories image of a bubble. Stories can't carry links, so the short URL is printed on it. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ handle: string }> }) {
  const { handle } = await ctx.params;
  const user = await resolveUser(decodeURIComponent(handle));
  const share = user ? await getShare(user.id) : null;
  if (!user || !share) return new Response("Not found", { status: 404 });
  const t = share.tally;
  const l = pct(t.red, t.total);
  const g = t.total ? 100 - l : 0;
  const verdict = bubbleVerdict(t);
  const art = await networkArt({ id: user.id, vote: share.vote, avatar: share.user.avatar }, (await getNetwork(user.id)).nodes);
  const link = shortLink(appUrl(req), sharePath(share.user.username));
  return new ImageResponse(
    (
      // Top and bottom ~220px stay quiet: Instagram draws its own UI there.
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: OG.bg, color: OG.fg, padding: "220px 72px 200px" }}>
        <div style={{ fontSize: 40, color: OG.subtle }}>{`A bolha de @${share.user.username} no X`}</div>
        <div style={{ display: "flex", alignItems: "baseline", marginTop: 28, fontSize: 112, fontWeight: 800, lineHeight: 1 }}>
          <span style={{ color: OG.red }}>{`${l}%`}</span>
          <span style={{ color: OG.subtle, fontSize: 72, margin: "0 28px" }}>×</span>
          <span style={{ color: OG.green }}>{`${g}%`}</span>
        </div>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", marginTop: 12, fontSize: 36, fontWeight: 700, padding: "0 40px" }}>
          <span style={{ color: OG.red }}>Vermelho</span>
          <span style={{ color: OG.green }}>Verde</span>
        </div>
        <div style={{ display: "flex", width: "100%", height: 32, marginTop: 24, borderRadius: 16, overflow: "hidden", background: OG.muted }}>
          <div style={{ width: `${l}%`, background: OG.red }} />
          <div style={{ width: `${g}%`, background: OG.green }} />
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 52, fontWeight: 800, color: verdict.side ? OG[verdict.side] : OG.fg }}>{verdict.label}</div>
        <div style={{ marginTop: 10, fontSize: 32, color: OG.subtle }}>{`${t.total} ${t.total === 1 ? "escolha" : "escolhas"} na rede`}</div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          {art.length > 0 && <BubbleArt nodes={art} width={W - 144} height={760} />}
        </div>
        <div style={{ fontSize: 64, fontWeight: 800 }}>E a sua bolha?</div>
        <div style={{ display: "flex", marginTop: 24, padding: "18px 40px", borderRadius: 999, background: OG.fg, color: OG.bg, fontSize: 38, fontWeight: 700 }}>
          {link}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" },
    },
  );
}
