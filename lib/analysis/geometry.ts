import type { Pt } from "./types"

export const COURT_W = 6.1
export const COURT_L = 13.4
export const NET_Y = COURT_L / 2
const SINGLES_IN = 0.46
const SHORT_SERVICE = 1.98
const LONG_SERVICE_DOUBLES = 0.76

/** Court corners in metres, in the same order the user marks them. */
export const COURT_CORNERS: Pt[] = [
  { x: 0, y: 0 },
  { x: COURT_W, y: 0 },
  { x: COURT_W, y: COURT_L },
  { x: 0, y: COURT_L },
]

/**
 * Lines the user can mark instead of the four corners (useful when a corner
 * is out of the picture). Each is marked where it meets the two outer
 * (doubles) sidelines. y is the distance from the far baseline in metres.
 */
export const MARK_LINES = {
  farBase: { y: 0, label: "Far baseline" },
  farLong: { y: LONG_SERVICE_DOUBLES, label: "Far long service line (doubles)" },
  farShort: { y: NET_Y - SHORT_SERVICE, label: "Far short service line" },
  net: { y: NET_Y, label: "Net (floor below the net, at the posts)" },
  nearShort: { y: NET_Y + SHORT_SERVICE, label: "Near short service line" },
  nearLong: { y: COURT_L - LONG_SERVICE_DOUBLES, label: "Near long service line (doubles)" },
  nearBase: { y: COURT_L, label: "Near baseline" },
} as const
export type MarkLine = keyof typeof MARK_LINES
export interface CourtMarks {
  top: MarkLine
  bottom: MarkLine
}
export const DEFAULT_MARKS: CourtMarks = { top: "farBase", bottom: "nearBase" }

/** Court points (metres) for the four marked image points, in marking order. */
export function markPoints(marks?: CourtMarks): Pt[] {
  const t = MARK_LINES[marks?.top ?? "farBase"].y
  const b = MARK_LINES[marks?.bottom ?? "nearBase"].y
  return [
    { x: 0, y: t },
    { x: COURT_W, y: t },
    { x: COURT_W, y: b },
    { x: 0, y: b },
  ]
}

export type Homography = number[]

/** Solve the 3x3 homography (h33 = 1) that maps src[i] -> dst[i]. */
export function computeHomography(src: Pt[], dst: Pt[]): Homography | null {
  if (src.length !== 4 || dst.length !== 4) return null
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u])
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v, v])
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let c = 0; c < 8; c++) {
    let piv = c
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r
    if (Math.abs(A[piv][c]) < 1e-12) return null
    ;[A[c], A[piv]] = [A[piv], A[c]]
    for (let r = 0; r < 8; r++) {
      if (r === c) continue
      const f = A[r][c] / A[c][c]
      if (f === 0) continue
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k]
    }
  }
  const h = A.map((row, i) => row[8] / row[i])
  return [...h, 1]
}

export function applyHomography(H: Homography, p: Pt): Pt {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  }
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

/**
 * Checks the four marked image corners (far-left, far-right, near-right,
 * near-left; image y grows downward). Returns problems found, empty = fine.
 */
export function validateCorners(c: Pt[]): string[] {
  const problems: string[] = []
  if (c.length !== 4) return ["Mark all four corners."]
  const signs = [0, 1, 2, 3].map((i) => Math.sign(cross(c[i], c[(i + 1) % 4], c[(i + 2) % 4])))
  if (!signs.every((s) => s === signs[0] && s !== 0)) {
    problems.push("The four points cross over or are not a court shape. Check their order: far-left, far-right, near-right, near-left.")
    return problems
  }
  if (signs[0] < 0) {
    problems.push("Left and right look swapped. Far-left should be on the left of far-right.")
  }
  const farY = (c[0].y + c[1].y) / 2
  const nearY = (c[2].y + c[3].y) / 2
  if (farY >= nearY) problems.push("The far baseline should be higher in the picture than the near baseline.")
  const farW = dist(c[0], c[1])
  const nearW = dist(c[2], c[3])
  if (farW > nearW * 1.15) problems.push("The far baseline looks wider than the near one. Check the points sit on the court corners.")
  return problems
}

export interface CourtLine {
  a: Pt
  b: Pt
  kind: "outer" | "inner" | "net"
}

/** All painted lines of a badminton court, in metres. */
export function courtLines(): CourtLine[] {
  const W = COURT_W
  const L = COURT_L
  const lines: CourtLine[] = []
  const h = (y: number, kind: CourtLine["kind"] = "inner", x0 = 0, x1 = W) =>
    lines.push({ a: { x: x0, y }, b: { x: x1, y }, kind })
  const v = (x: number, y0: number, y1: number, kind: CourtLine["kind"] = "inner") =>
    lines.push({ a: { x, y: y0 }, b: { x, y: y1 }, kind })
  h(0, "outer")
  h(L, "outer")
  v(0, 0, L, "outer")
  v(W, 0, L, "outer")
  v(SINGLES_IN, 0, L)
  v(W - SINGLES_IN, 0, L)
  h(LONG_SERVICE_DOUBLES)
  h(L - LONG_SERVICE_DOUBLES)
  h(NET_Y - SHORT_SERVICE)
  h(NET_Y + SHORT_SERVICE)
  v(W / 2, 0, NET_Y - SHORT_SERVICE)
  v(W / 2, NET_Y + SHORT_SERVICE, L)
  h(NET_Y, "net", -0.3, W + 0.3)
  return lines
}

/** Distance of a court point from the net, in metres. */
export function depthFromNet(p: Pt): number {
  return Math.abs(p.y - NET_Y)
}

export function sideOf(p: Pt): "near" | "far" {
  return p.y >= NET_Y ? "near" : "far"
}
