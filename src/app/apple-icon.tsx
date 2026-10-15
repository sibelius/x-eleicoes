import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same artwork as icon.svg (keep in sync), rasterized for iOS home screens; square, since iOS rounds the corners.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0c0c0e"/>
  <circle cx="13" cy="30" r="8" fill="#f0444f"/>
  <circle cx="20" cy="47" r="5" fill="#f0444f"/>
  <circle cx="19" cy="15" r="4" fill="#f0444f"/>
  <circle cx="51" cy="34" r="8" fill="#2bb56b"/>
  <circle cx="44" cy="17" r="5" fill="#2bb56b"/>
  <circle cx="46" cy="50" r="4" fill="#2bb56b"/>
  <circle cx="32" cy="12" r="3" fill="#5d5d64"/>
  <circle cx="32" cy="53" r="3" fill="#5d5d64"/>
  <circle cx="32" cy="32" r="10" fill="#f2f2f0"/>
</svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
    <img src={`data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`} width={180} height={180} alt="" />,
    size,
  );
}
