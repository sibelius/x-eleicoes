import { ImageResponse } from "next/og";
import { BubbleArt, OG, demoArt } from "@/lib/bubble-art";

export const alt = "Minha Bolha: de que lado está a sua rede do X";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: OG.bg, color: OG.fg }}>
        <div style={{ display: "flex", flexDirection: "column", width: 500, paddingLeft: 72 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>Minha Bolha</div>
          <div style={{ marginTop: 24, fontSize: 34, color: OG.subtle, lineHeight: 1.3 }}>
            Escolha Vermelho ou Verde e veja de que lado está a sua bolha do X.
          </div>
          <div style={{ display: "flex", gap: 28, marginTop: 40, fontSize: 28, fontWeight: 700 }}>
            <span style={{ color: OG.lula }}>● Vermelho</span>
            <span style={{ color: OG.bolso }}>● Verde</span>
          </div>
        </div>
        <BubbleArt nodes={demoArt()} width={660} height={590} />
      </div>
    ),
    size,
  );
}
