import { ImageResponse } from "next/og";
import { pct } from "@/lib/links";
import { getShare } from "@/lib/network";

export const alt = "Como a minha rede do X vota";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const share = await getShare(id);
  const t = share?.tally ?? { lula: 0, bolsonaro: 0, total: 0 };
  const l = pct(t.lula, t.total);
  const b = t.total ? 100 - l : 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#0c0c0e", color: "#f2f2f0" }}>
        <div style={{ fontSize: 34, color: "#9c9ca3" }}>{`Como a rede de @${share?.user.username ?? "?"} vota`}</div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40, fontSize: 84, fontWeight: 800 }}>
          <span style={{ color: "#f0444f" }}>{`Lula ${l}%`}</span>
          <span style={{ color: "#2bb56b" }}>{`Bolsonaro ${b}%`}</span>
        </div>
        <div style={{ display: "flex", height: 48, marginTop: 24, borderRadius: 24, overflow: "hidden", background: "#222226" }}>
          <div style={{ width: `${l}%`, background: "#f0444f" }} />
          <div style={{ width: `${b}%`, background: "#2bb56b" }} />
        </div>
        <div style={{ marginTop: 32, fontSize: 30, color: "#9c9ca3" }}>{`${t.total} votos na rede · E a sua rede?`}</div>
      </div>
    ),
    size,
  );
}
