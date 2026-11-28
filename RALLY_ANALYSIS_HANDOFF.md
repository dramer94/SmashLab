# Rally Analysis: handoff (state on 2026-11-28)

Read this first if you are continuing this work in a new session or account.
Everything below is on branch **`claude/trusting-heisenberg-4ih6s3`** of `dramer94/SmashLab`.
It is **not merged to `main` and not deployed** yet.

## What is built

`/analysis` lets a player analyse their own match video **in the browser** (the video never
leaves the device):

- Court marking: 4 corners, or any two court lines (e.g. the two short service lines when
  filming from the net post, side-on).
- Shots from hit sounds (with a rally-rhythm rescue, a minimum spacing and a player-motion
  gate), player tracking by background subtraction + court homography, doubles identities
  kept by shirt colour (with a post-pass that swaps back mixed-up stretches), shuttle trail
  and landing in/out, rallies and score, shot types, speed estimates, distance, calories,
  heatmap, camera-cut handling for TV footage.
- Review/edit tools, overlay video recording with 6 HUD themes, logo/text, player focus,
  hit/crowd sounds, slow-mo replays and an end card.
- **Coach**: per-player strengths, things to work on, drills and "watch" links.
- Accounts (email + password), profile stats, share links, weekly leaderboard.
  Needs the SQL in `prisma/migrations/add-accounts.sql` (see `RALLY_ANALYSIS_DEPLOY.md`).

Main code: `app/analysis/`, `components/analysis/`, `lib/analysis/`, `lib/auth.ts`,
`app/api/{auth,me,share}/`, `app/{account,me}/`. Lab tools: `scripts/rally-lab/`.

## Run it on your computer

```bash
git clone https://github.com/dramer94/SmashLab && cd SmashLab
git checkout claude/trusting-heisenberg-4ih6s3
npm ci
npm run dev            # http://localhost:3000/analysis works without a database
```

For sign-in/save/share locally, point `DATABASE_URL` at a **local** PostgreSQL and run
`npx prisma db execute --file prisma/migrations/add-accounts.sql --schema prisma/schema.prisma`
(plus the existing tables). **Never run `prisma db push` against the shared Neon database.**

## Test videos (Amer's club, 2026-11-27)

Google Drive, owner amer2594, folder **"Badminton Video"** (`IMG_6054/6055/6056/6058.MOV`,
iPhone 1080p HEVC, 0.5x lens). The phone stands at the **net post**, looking along the net:
one half of the court on the left of the picture, the other on the right.
Mark with **Two court lines**: farther = *Far short service line*, nearer = *Near short
service line*, points where each meets the outer sidelines (pixels in a 1280x720 frame):

| Video | Length | Points 1-4 |
|---|---|---|
| IMG_6054 | 11:49 | (352,553) (530,429) (762,419) (928,527) |
| IMG_6055 | 10:13 | (355,557) (529,432) (761,421) (933,529) |
| IMG_6058 | 6:07 | (275,587) (506,402) (763,394) (1034,558) |
| IMG_6056 | 0:30 | not a game (people in front of the phone) |

All parts were analysed in 5-minute pieces; tracking found players in 76-89% of frames
and every player kept their label (checked with who's-who pictures).

## Naming players: face matching (in progress)

Amer wants names from faces, matched against VACA profile photos (he confirmed the VACA
players have agreed to their photos being used for this). Tested with
`scripts/rally-lab/faces.py` (YuNet + SFace):

- face-api.js (first attempt) failed on this footage: 7% of head crops had a face and
  fingerprints did not separate people.
- YuNet + SFace on full 1080p frames: ~930 faces per 5 min on the four players; the nearest
  face belongs to the same player 75% of the time. Names come from votes over all faces.
- 27 of 52 VACA players have a profile photo (`https://vacabc.my/api/players`, public).

Suggested names (shown to Amer, who said **some are right and some are wrong; corrections
still to come**):

| # | Video | Player | Suggested | Confidence |
|---|---|---|---|---|
| 1 | IMG_6054 | Red shirt | RAZAK | medium |
| 2 | IMG_6054 | Black t-shirt | AKIF | high |
| 3 | IMG_6054 | Navy shirt | IKHMAL | high |
| 4 | IMG_6054 | Black sleeveless, glasses | AMER | high |
| 5 | IMG_6055 | Dark patterned jersey | FARID | medium |
| 6 | IMG_6055 | Navy sleeveless, glasses | AMER | medium |
| 7 | IMG_6055 | White jersey | HANIF | medium |
| 8 | IMG_6055 | Grey/orange jersey | IZZUDDIN | high |
| 9 | IMG_6058 | Teal "Score" t-shirt | SADDIQ | low (Amirul A close) |
| 10 | IMG_6058 | Green striped jersey | IZZUDDIN | low (likely wrong) |
| 11 | IMG_6058 | Red/gold jersey | SYAFIQ | high |
| 12 | IMG_6058 | Grey t-shirt | ARIL | high |

## Next steps

1. Get Amer's corrections for the table above; count how many "high" were right. That
   decides whether face suggestions go into the app or a VACA roster picker is better.
2. Put the confirmed names into each analysis and give each named player a coach report
   combining all videos they appear in (Amer is probably in 6054 and 6055).
3. In the app: "Recognise players from VACA": a server route proxying VACA's player list
   and photos (CORS), YuNet + SFace in the browser (onnxruntime-web or opencv.js), suggestions
   with confidence that the user confirms before saving; fall back to a roster picker.
4. Deploy: merge to `main`, run the accounts SQL, `./deploy.sh update` (see
   `RALLY_ANALYSIS_DEPLOY.md`).

## Warnings

- VACA's `prisma/schema.prisma` contains copies of SmashLab's `sl_` tables but not the four
  new account tables (`sl_user`, `sl_auth_session`, `sl_play_stat`, `sl_shared_analysis`).
  A `prisma db push` from VACA against the shared database could offer to drop them.
- The "Badminton Video" Drive folder was set to "Anyone with the link" to download the
  videos; it must be set back to **Restricted** in Drive.
