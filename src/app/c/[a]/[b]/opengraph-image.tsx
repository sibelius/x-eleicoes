import { ImageResponse } from "next/og";
import { BubbleArt, OG, networkArt } from "@/lib/bubble-art";
import { pct } from "@/lib/links";
import { getComparison } from "@/lib/network";

export const alt = "Duas bolhas do X comparadas";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  const c = await getComparison(decodeURIComponent(a), decodeURIComponent(b));
  const sides = c ? [c.a, c.b] : [];
  const arts = await Promise.all(
    sides.map((s) => networkArt({ id: s.user.id, vote: s.vote, avatar: s.user.avatar }, s.nodes.slice(0, 80))),
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: OG.bg, color: OG.fg }}>
        {sides.map((s, i) => {
          const l = pct(s.tally.lula, s.tally.total);
          const bo = s.tally.total ? 100 - l : 0;
          return (
            <div
              key={s.user.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 600,
                paddingTop: 36,
                borderLeft: i ? `2px solid ${OG.muted}` : "none",
              }}
            >
              <div style={{ fontSize: 40, fontWeight: 800 }}>{`@${s.user.username}`}</div>
              <div style={{ display: "flex", gap: 24, marginTop: 8, fontSize: 36, fontWeight: 800 }}>
                <span style={{ color: OG.lula }}>{`Lula ${l}%`}</span>
                <span style={{ color: OG.bolso }}>{`Bolsonaro ${bo}%`}</span>
              </div>
              <div style={{ display: "flex", width: 480, height: 18, marginTop: 14, borderRadius: 9, overflow: "hidden", background: OG.muted }}>
                <div style={{ width: `${l}%`, background: OG.lula }} />
                <div style={{ width: `${bo}%`, background: OG.bolso }} />
              </div>
              {arts[i].length > 0 && <BubbleArt nodes={arts[i]} width={560} height={420} />}
            </div>
          );
        })}
      </div>
    ),
    size,
  );
}
