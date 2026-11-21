import { COURT_L, COURT_W, courtLines } from "@/lib/analysis/geometry"

/** Top-down court in metres (far baseline at the top). Children draw in metres. */
export function CourtSvg({
  children,
  className,
  margin = 1,
  label,
}: {
  children?: React.ReactNode
  className?: string
  margin?: number
  label?: string
}) {
  return (
    <svg
      viewBox={`${-margin} ${-margin} ${COURT_W + margin * 2} ${COURT_L + margin * 2}`}
      className={className}
      role="img"
      aria-label={label ?? "Badminton court map"}
    >
      <rect x={0} y={0} width={COURT_W} height={COURT_L} fill="#0f3d2e" rx={0.05} />
      {courtLines().map((l, i) => (
        <line
          key={i}
          x1={l.a.x}
          y1={l.a.y}
          x2={l.b.x}
          y2={l.b.y}
          stroke={l.kind === "net" ? "#e5e7eb" : "rgba(255,255,255,0.7)"}
          strokeWidth={l.kind === "net" ? 0.08 : 0.04}
          strokeDasharray={l.kind === "net" ? "0.15 0.1" : undefined}
        />
      ))}
      {children}
    </svg>
  )
}
