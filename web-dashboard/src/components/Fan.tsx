import { tempColor, tempSpinSeconds } from "./Cards";

// A clean 4-blade fan. Spins (CSS) when the sensor is online; the speed and
// colour track temperature. Idle/offline fans are grey and still.
export default function Fan({
  tempC,
  online,
  size = 58,
}: {
  tempC: number | null;
  online: boolean;
  size?: number;
}) {
  const spinning = online && tempC != null;
  const color = spinning ? tempColor(tempC as number) : "#c7ccd3";
  const dur = spinning ? tempSpinSeconds(tempC as number) : 0;

  return (
    <div className={`fan${spinning ? " spinning" : ""}`}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* outer ring */}
        <circle cx="50" cy="50" r="47" fill="none" stroke="var(--border-strong)" strokeWidth="3" />
        <g className="blades" style={{ animationDuration: dur ? `${dur}s` : undefined }}>
          {[0, 90, 180, 270].map((deg) => (
            <ellipse
              key={deg}
              cx="50"
              cy="29"
              rx="11"
              ry="20"
              fill={color}
              opacity={0.92}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          <circle cx="50" cy="50" r="9" fill="#fff" stroke={color} strokeWidth="3" />
        </g>
      </svg>
    </div>
  );
}
