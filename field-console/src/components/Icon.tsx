import type { CSSProperties } from "react";

/** A Google Material Symbol (Rounded), rendered via the font ligature, e.g.
 *  <Icon name="memory" />. `fill` switches to the filled variant; `size` in px. */
export default function Icon({
  name,
  size = 20,
  fill = false,
  weight,
  className = "",
  color,
  style,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: number;
  className?: string;
  color?: string;
  style?: CSSProperties;
}) {
  const fvs = [
    `'opsz' ${size}`,
    `'FILL' ${fill ? 1 : 0}`,
    weight != null ? `'wght' ${weight}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span
      className={`msym ${className}`}
      aria-hidden="true"
      style={{ fontSize: size, color, fontVariationSettings: fvs, ...style }}
    >
      {name}
    </span>
  );
}
