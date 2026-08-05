import type { CSSProperties } from "react";

/** A Google Material Symbol (Rounded). Renders the named glyph via the font
 *  ligature, e.g. <Icon name="thermostat" />. `fill` switches to the filled
 *  variant; `size` is in px. */
export default function Icon({
  name,
  size = 20,
  fill = false,
  weight,
  className = "",
  color,
  style,
  label,
}: {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: number;
  className?: string;
  color?: string;
  style?: CSSProperties;
  /**
   * Accessible name, for when the icon IS the content — an icon-only button, say.
   * Without this the span is aria-hidden and a button wrapping nothing else has
   * no accessible name at all, so a screen reader announces only "button".
   * Leave unset for decorative icons that sit beside real text.
   */
  label?: string;
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
      // Decorative by default; when `label` is given the icon carries the name.
      aria-hidden={label ? undefined : "true"}
      role={label ? "img" : undefined}
      aria-label={label}
      style={{ fontSize: size, color, fontVariationSettings: fvs, ...style }}
    >
      {name}
    </span>
  );
}
