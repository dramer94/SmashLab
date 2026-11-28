import { depthFromNet, dist, COURT_W } from "./geometry"
import { other, SHOT_LABELS } from "./engine"
import type { AnalysisResult, Pt, Session, ShotType, Side } from "./types"

/**
 * Coach report for one player, worked out from the analysis alone (no AI
 * service, nothing leaves the device). Every tip carries the numbers it is
 * based on and moments in the video to watch, so the player can judge it.
 */

export interface CoachMoment {
  t: number
  label: string
}

export interface CoachTip {
  kind: "strength" | "improve"
  /** True when the tip only compares you with the others in this clip. */
  relative?: boolean
  title: string
  /** What the video shows, in numbers. */
  evidence: string
  why: string
  drill?: string
  moments: CoachMoment[]
  /** Size of the effect, used to order tips. */
  weight: number
}

export interface CoachReport {
  name: string
  side: Side
  slot: number
  summary: string
  numbers: { label: string; value: string }[]
  strengths: CoachTip[]
  improve: CoachTip[]
  caveats: string[]
}

const ATTACK: ShotType[] = ["smash", "drop", "net", "drive", "push"]
const DEFENCE: ShotType[] = ["clear", "lift"]

interface Mover {
  side: Side
  slot: number
  distance: number
  time: number
  samples: { t: number; p: Pt }[]
}

/** Movement during rallies only (walking between points is not counted). */
function movers(session: Session, result: AnalysisResult): Mover[] {
  const slots = session.settings.format === "doubles" ? 2 : 1
  const windows = result.rallies.map((r) => ({ a: r.start - 0.3, b: r.end + 0.6 }))
  const inRally = (t: number) => windows.some((w) => t >= w.a && t <= w.b)
  const out: Mover[] = []
  for (const side of ["near", "far"] as Side[]) {
    for (let slot = 0; slot < slots; slot++) {
      let distance = 0
      let time = 0
      let anchor: { t: number; p: Pt } | null = null
      let prevT: number | null = null
      const samples: { t: number; p: Pt }[] = []
      for (const f of session.track) {
        const p = f[side][slot]
        if (!p || !inRally(f.t)) { anchor = null; prevT = null; continue }
        samples.push({ t: f.t, p })
        if (prevT != null && f.t - prevT < 0.4) time += f.t - prevT
        prevT = f.t
        if (!anchor) { anchor = { t: f.t, p }; continue }
        const d = dist(anchor.p, p)
        if (d >= 0.25) {
          if (d / Math.max(f.t - anchor.t, 0.05) <= 8.5) distance += d
          anchor = { t: f.t, p }
        }
      }
      out.push({ side, slot, distance, time, samples })
    }
  }
  return out
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const fmtT = (session: Session, t: number) => {
  const s = Math.max(0, t - session.range.start)
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`
}

export function coachReport(session: Session, result: AnalysisResult, side: Side, slot: number): CoachReport {
  const doubles = session.settings.format === "doubles"
  const name = session.settings.players[side][slot]?.name ?? side
  const opp = other(side)
  const tips: CoachTip[] = []
  const caveats: string[] = []
  const numbers: { label: string; value: string }[] = []

  // ---- Movement ---------------------------------------------------------
  const all = movers(session, result)
  const me = all.find((m) => m.side === side && m.slot === slot)!
  const speed = (m: Mover) => (m.time > 5 ? m.distance / m.time : null)
  const mySpeed = speed(me)
  const others = all.filter((m) => m !== me).map(speed).filter((v): v is number => v != null)
  if (mySpeed != null && others.length) {
    const avg = others.reduce((a, b) => a + b, 0) / others.length
    numbers.push({ label: "Moving in rallies", value: `${mySpeed.toFixed(2)} m/s (others ${avg.toFixed(2)})` })
    const rel = mySpeed / avg - 1
    if (rel <= -0.15) {
      // Rallies where I moved least: good examples to watch.
      const perRally = result.rallies
        .filter((r) => r.shots.length >= 4)
        .map((r) => {
          const s = me.samples.filter((x) => x.t >= r.start && x.t <= r.end)
          let d = 0
          for (let i = 1; i < s.length; i++) d += dist(s[i - 1].p, s[i].p)
          return { r, v: d / Math.max(0.5, r.end - r.start) }
        })
        .sort((a, b) => a.v - b.v)
        .slice(0, 3)
      tips.push({
        kind: "improve",
        title: "Get moving earlier",
        evidence: `During rallies you moved ${Math.round(-rel * 100)}% less than the other players (${mySpeed.toFixed(2)} vs ${avg.toFixed(2)} m/s).`,
        why: "Arriving late means hitting the shuttle low and late, which forces lifts and clears instead of attacking.",
        drill: "Split-step as the opponent hits, then 6-corner shadow footwork: 3 × 1 minute, 30 s rest, pushing off from the split-step every time.",
        moments: perRally.map(({ r }) => ({ t: r.start, label: `Rally ${r.index + 1} (${fmtT(session, r.start)})` })),
        weight: -rel,
      })
    } else if (rel >= 0.15) {
      tips.push({
        kind: "strength",
        title: "You cover the court",
        evidence: `You moved ${Math.round(rel * 100)}% more than the other players during rallies (${mySpeed.toFixed(2)} vs ${avg.toFixed(2)} m/s).`,
        why: "Good work rate gets you to the shuttle early, so you can choose your shot.",
        moments: [],
        weight: rel,
      })
    }
  }

  // ---- Where you stand ---------------------------------------------------
  const own = me.samples.filter((s) => (side === "near" ? s.p.y >= 6.7 : s.p.y <= 6.7))
  if (own.length >= 30) {
    const depth = own.map((s) => depthFromNet(s.p))
    const front = depth.filter((d) => d < 2.5).length / depth.length
    const back = depth.filter((d) => d > 4.5).length / depth.length
    const avgX = own.reduce((a, s) => a + s.p.x, 0) / own.length
    numbers.push({ label: "Time near the net / at the back", value: `${pct(front)} / ${pct(back)}` })

    if (doubles) {
      const mate = all.find((m) => m.side === side && m.slot !== slot)
      if (mate) {
        let close = 0, wide = 0, n = 0, sideBySide = 0, frontBack = 0
        const closeT: number[] = []
        for (const s of me.samples) {
          const q = mate.samples.find((x) => Math.abs(x.t - s.t) < 0.06)
          if (!q) continue
          n++
          const d = dist(s.p, q.p)
          const dd = Math.abs(depthFromNet(s.p) - depthFromNet(q.p))
          const dx = Math.abs(s.p.x - q.p.x)
          if (d < 1.3) { close++; closeT.push(s.t) }
          if (d > 5.5) wide++
          if (dd < 1.2 && dx > 1.8) sideBySide++
          else if (dd > 1.5 && dx < 2.5) frontBack++
        }
        if (n >= 30) {
          numbers.push({ label: "With partner: side by side / front-back", value: `${pct(sideBySide / n)} / ${pct(frontBack / n)}` })
          if (close / n > 0.12) {
            const ts = closeT.filter((t, i) => i === 0 || t - closeT[i - 1] > 3).slice(0, 3)
            tips.push({
              kind: "improve",
              title: "Give your partner space",
              evidence: `You and your partner were less than 1.3 m apart for ${pct(close / n)} of rally time.`,
              why: "Standing close leaves both sidelines (or front and back) open and risks clashing rackets.",
              drill: "Rotation drill with your partner: attack → front-back, the moment you lift → side-by-side. Call 'mine/yours' on every middle shuttle.",
              moments: ts.map((t) => ({ t, label: `Close together at ${fmtT(session, t)}` })),
              weight: close / n,
            })
          }
          if (wide / n > 0.2) {
            tips.push({
              kind: "improve",
              title: "Close the gap between you and your partner",
              evidence: `For ${pct(wide / n)} of rally time you were more than 5.5 m from your partner.`,
              why: "A big gap opens the middle of the court and the opponents will play into it.",
              drill: "Two-against-one defence: the coach feeds down the middle while you two hold a side-by-side shape 3–4 m apart.",
              moments: [],
              weight: wide / n,
            })
          }
          if (frontBack / n > 0.35 && sideBySide / n > 0.25) {
            tips.push({
              kind: "strength",
              title: "You rotate with your partner",
              evidence: `You switched between attacking (front-back, ${pct(frontBack / n)}) and defending (side by side, ${pct(sideBySide / n)}) shapes.`,
              why: "Rotating with the shuttle is what keeps a doubles pair covered.",
              moments: [],
              weight: 0.3,
            })
          }
        }
      }
    } else {
      const avgDepth = depth.reduce((a, b) => a + b, 0) / depth.length
      numbers.push({ label: "Average distance from the net", value: `${avgDepth.toFixed(1)} m` })
      if (avgDepth > 4.6) {
        tips.push({
          kind: "improve",
          title: "Base a step further forward",
          evidence: `On average you stood ${avgDepth.toFixed(1)} m from the net; ${pct(back)} of the time at the back.`,
          why: "From too far back, net shots and drops are hard to reach in time.",
          drill: "Return to a base 0.5 m behind the short-service T after every shot; a partner feeds random net and clear shots.",
          moments: [],
          weight: (avgDepth - 4.6) / 2,
        })
      }
    }
    const offCentre = avgX - COURT_W / 2
    if (!doubles && Math.abs(offCentre) > 0.8) {
      tips.push({
        kind: "improve",
        title: "Recover to the middle",
        evidence: `You stood on average ${Math.abs(offCentre).toFixed(1)} m off the centre line.`,
        why: "A base off the centre leaves the far side open for the opponent.",
        drill: "Shadow footwork back to the centre after every shot, with a split-step on the opponent's hit.",
        moments: [],
        weight: Math.abs(offCentre) / 2,
      })
    }
  }

  // ---- Shots -------------------------------------------------------------
  const mine = result.shots.filter((s) => s.side === side && (!doubles || s.playerIndex === slot) && s.type !== "serve")
  const theirs = result.shots.filter((s) => s.side === opp && s.type !== "serve")
  if (mine.length >= 6) {
    const share = (list: typeof mine, types: ShotType[]) => list.filter((s) => types.includes(s.type)).length / Math.max(1, list.length)
    const myDef = share(mine, DEFENCE)
    const myAtt = share(mine, ATTACK)
    const theirAtt = share(theirs, ATTACK)
    numbers.push({ label: "Your shots: attacking / clears & lifts", value: `${pct(myAtt)} / ${pct(myDef)}` })
    if (myDef > 0.45) {
      const ex = mine.filter((s) => DEFENCE.includes(s.type)).slice(0, 3)
      tips.push({
        kind: "improve",
        title: "Lift less, keep the shuttle down",
        evidence: `${pct(myDef)} of your shots were clears or lifts, which hands the opponents the attack.`,
        why: "Every lift lets the other side smash. Pushes, drives and drops keep you level or on the attack.",
        drill: "Half-court push/drive drill: both stay mid-court and keep the shuttle below the tape height for 2 minutes; no lifting allowed.",
        moments: ex.map((s) => ({ t: s.t - 0.8, label: `${SHOT_LABELS[s.type]} at ${fmtT(session, s.t)}` })),
        weight: myDef - 0.35,
      })
    } else if (myAtt > theirAtt + 0.1 && myAtt > 0.5) {
      tips.push({
        kind: "strength",
        title: "You keep the pressure on",
        evidence: `${pct(myAtt)} of your shots were attacking (smash, drop, net, drive, push) against ${pct(theirAtt)} from the other side.`,
        why: "Keeping the shuttle down forces the opponents to lift.",
        moments: [],
        weight: myAtt - theirAtt,
      })
    }
    const smashes = mine.filter((s) => s.type === "smash")
    const fromBack = mine.filter((s) => s.pos && depthFromNet(s.pos) > 4.3)
    // Readings over 300 km/h from a phone video are measuring errors (a mis-tracked foot), not smashes.
    const sp = smashes.map((s) => s.speedKmh).filter((v): v is number => v != null && v <= 300)
    const typical = sp.length ? [...sp].sort((a, b) => a - b)[Math.floor(sp.length / 2)] : null
    if (sp.length) numbers.push({ label: "Smashes (average speed, estimate)", value: `${smashes.length} (${Math.round(sp.reduce((a, b) => a + b, 0) / sp.length)} km/h)` })
    if (fromBack.length >= 4 && smashes.length / fromBack.length < 0.2) {
      tips.push({
        kind: "improve",
        title: "Use your smash from the back",
        evidence: `You hit ${fromBack.length} shots from the back of the court but only ${smashes.length} were smashes.`,
        why: "Clearing from the back gives the rally away; a smash or a fast drop takes it.",
        drill: "Feeder lifts to the back: alternate smash and drop from the same body shape so the opponent can't read it, 3 × 10 shuttles.",
        moments: fromBack.slice(0, 3).map((s) => ({ t: s.t - 0.8, label: `${SHOT_LABELS[s.type]} from the back at ${fmtT(session, s.t)}` })),
        weight: 0.25,
      })
    } else if (smashes.length >= 3 && sp.length >= 2 && typical != null && typical >= 180) {
      tips.push({
        kind: "strength",
        title: "Strong smash",
        evidence: `${smashes.length} smashes, typically about ${typical} km/h (estimate).`,
        why: "A smash that forces weak replies wins you short rallies.",
        moments: smashes.filter((s) => (s.speedKmh ?? 0) <= 300).sort((a, b) => (b.speedKmh ?? 0) - (a.speedKmh ?? 0)).slice(0, 2).map((s) => ({ t: s.t - 0.8, label: `Smash at ${fmtT(session, s.t)}` })),
        weight: 0.2,
      })
    }
  } else {
    caveats.push("Too few shots were credited to you in this clip to judge your shot choice.")
  }

  // ---- How rallies end on your shot ---------------------------------------
  // Only rallies whose winner is known (set by the user or the shuttle was seen
  // landing): otherwise the app assumes the last hitter won, which says nothing.
  const known = result.rallies.filter((r) => r.winnerSource === "manual" || r.winnerSource === "landing")
  const endings = known.filter((r) => {
    const last = r.shots[r.shots.length - 1]
    return r.shots.length >= 2 && last.side === side && (!doubles || last.playerIndex === slot)
  })
  const lost = endings.filter((r) => r.winner !== side)
  const won = endings.filter((r) => r.winner === side)
  if (endings.length >= 3) {
    numbers.push({ label: "Rallies ending on your shot: won / lost", value: `${won.length} / ${lost.length}` })
    if (lost.length >= 3 && lost.length > won.length) {
      tips.push({
        kind: "improve",
        title: "Cut the errors that end rallies",
        evidence: `${lost.length} of the ${endings.length} rallies that ended on your shot were lost: most likely the shuttle went into the net or out.`,
        why: "Free points for the opponents; amateur doubles is often decided by errors, not winners.",
        drill: "Target practice: 20 drives and 20 lifts aimed at a 1 m box 0.5 m inside the lines, then the same under pressure from a feeder.",
        moments: lost.slice(0, 3).map((r) => ({ t: r.shots[r.shots.length - 1].t - 1.5, label: `End of rally ${r.index + 1}` })),
        weight: lost.length / endings.length,
      })
    } else if (won.length >= 3 && won.length > lost.length) {
      tips.push({
        kind: "strength",
        title: "You finish rallies",
        evidence: `${won.length} of the ${endings.length} rallies that ended on your shot were won.`,
        why: "Turning chances into points is what separates good players.",
        moments: won.slice(0, 2).map((r) => ({ t: r.shots[r.shots.length - 1].t - 1.5, label: `Winner in rally ${r.index + 1}` })),
        weight: won.length / endings.length,
      })
    }
  }
  if (known.length < Math.min(5, result.rallies.length)) {
    caveats.push("Errors and winners are left out: who won each rally isn't known yet. Set the winners in the rally list (tap a winner to change it) and the coach will tell you which rallies you lose on your own shot.")
  }

  // ---- Compared with the others on court (smaller, relative points) -------
  if (!tips.some((t) => t.kind === "improve")) {
    // Each metric: my value vs the group average; "gap" > 0 means I'm behind.
    type Metric = { gap: number; tip: () => CoachTip }
    const metrics: Metric[] = []
    const group = <T,>(f: (m: Mover) => T | null) =>
      all.map((m) => ({ m, v: f(m) })).filter((x) => x.v != null) as { m: Mover; v: T }[]
    const avgOf = (xs: { v: number }[]) => xs.reduce((a, b) => a + b.v, 0) / xs.length

    const sp = group((m) => speed(m))
    if (mySpeed != null && sp.length >= 2) {
      const avg = avgOf(sp)
      metrics.push({
        gap: (avg - mySpeed) / avg,
        tip: () => ({
          kind: "improve",
          title: "Be first to the shuttle",
          evidence: `Compared with the others on court you moved ${mySpeed < avg ? "less" : "about the same"} during rallies (${mySpeed.toFixed(2)} vs ${avg.toFixed(2)} m/s average).`,
          why: "Small gains in starting speed let you take the shuttle higher and earlier.",
          drill: "Split-step on every opponent hit, then shadow to the four corners: 3 × 1 minute.",
          moments: [],
          weight: 0,
          relative: true,
        }),
      })
    }
    const shotsOf = (sd: Side, sl: number) => result.shots.filter((s) => s.side === sd && (!doubles || s.playerIndex === sl) && s.type !== "serve")
    const def = group((m) => {
      const l = shotsOf(m.side, m.slot)
      return l.length >= 6 ? l.filter((s) => DEFENCE.includes(s.type)).length / l.length : null
    })
    const myDefR = def.find((x) => x.m === me)?.v
    if (myDefR != null && def.length >= 2) {
      const avg = avgOf(def)
      metrics.push({
        gap: myDefR - avg,
        tip: () => ({
          kind: "improve",
          title: "Look for a flatter shot before lifting",
          evidence: `Compared with the others you clear or lift more (${pct(myDefR)} of your shots vs ${pct(avg)} average).`,
          why: "Each lift gives the other side a chance to attack; a push or drive keeps it level.",
          drill: "Mid-court drive and push rallies with your partner, 2 minutes without lifting.",
          moments: shotsOf(side, slot).filter((s) => DEFENCE.includes(s.type)).slice(0, 2).map((s) => ({ t: s.t - 0.8, label: `${SHOT_LABELS[s.type]} at ${fmtT(session, s.t)}` })),
          weight: 0,
          relative: true,
        }),
      })
    }
    const back = group((m) => {
      const l = shotsOf(m.side, m.slot).filter((s) => s.pos && depthFromNet(s.pos) > 4.3)
      return l.length >= 3 ? l.filter((s) => s.type === "smash").length / l.length : null
    })
    const myBack = back.find((x) => x.m === me)?.v
    if (myBack != null && back.length >= 2) {
      const avg = avgOf(back)
      metrics.push({
        gap: avg - myBack,
        tip: () => ({
          kind: "improve",
          title: "Attack more from the back",
          evidence: `Compared with the others you smash less from the back of the court (${pct(myBack)} of those shots vs ${pct(avg)} average).`,
          why: "A steep smash or fast drop from the back starts the attack instead of giving the shuttle back.",
          drill: "Feeder lifts to the back: smash, then follow in for the net kill; 3 × 8 shuttles.",
          moments: [],
          weight: 0,
          relative: true,
        }),
      })
    }
    const net = group((m) => {
      const ownHalf = m.samples.filter((x) => (m.side === "near" ? x.p.y >= 6.7 : x.p.y <= 6.7))
      return ownHalf.length >= 30 ? ownHalf.filter((x) => depthFromNet(x.p) < 2.5).length / ownHalf.length : null
    })
    const myNet = net.find((x) => x.m === me)?.v
    if (myNet != null && net.length >= 2) {
      const avg = avgOf(net)
      metrics.push({
        gap: (avg - myNet) * 0.8,
        tip: () => ({
          kind: "improve",
          title: "Take the net when you can",
          evidence: `Compared with the others you spend less time near the net (${pct(myNet)} of rally time vs ${pct(avg)} average).`,
          why: doubles
            ? "In doubles the pair that controls the net gets the lifts. Follow your serve and your partner's smash in to the front."
            : "Meeting the shuttle early at the net forces your opponent to lift.",
          drill: "Net play with a partner: tumbling net shots and pushes for 2 minutes, then 'serve and follow in' 10 times.",
          moments: [],
          weight: 0,
          relative: true,
        }),
      })
    }
    const rel = metrics
      .filter((x) => x.gap > 0.02)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 2)
      .map((x) => ({ ...x.tip(), weight: x.gap }))
    tips.push(...rel)
    if (rel.length) caveats.push("Points that start \"Compared with the others\" are differences within this group of players, not clear faults.")
  }

  if (doubles) caveats.push("In doubles, telling which partner hit a shot is the least reliable part; check the moments before acting on shot advice.")
  caveats.push("Based on one video. Speeds, distances and shot types are estimates.")

  const strengths = tips.filter((t) => t.kind === "strength").sort((a, b) => b.weight - a.weight).slice(0, 2)
  const improve = tips.filter((t) => t.kind === "improve").sort((a, b) => b.weight - a.weight).slice(0, 3)
  const summary = improve.length
    ? `Main thing to work on: ${improve[0].title.toLowerCase()}.${strengths.length ? ` Keep doing: ${strengths[0].title.toLowerCase()}.` : ""}`
    : strengths.length
      ? `Nothing stood out to fix in this clip. Keep doing: ${strengths[0].title.toLowerCase()}.`
      : "Not enough of your play was tracked in this clip to give advice. Try a longer clip."
  return { name, side, slot, summary, numbers, strengths, improve, caveats }
}
