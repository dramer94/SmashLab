# Rally Analysis lab tools

Scripts used to test `/analysis` on real videos outside the app UI. They need the
app running locally (`npm run dev`) and Playwright's Chromium (`npx playwright install chromium`).
Keep all videos, frames and photos in `lab-data/` (git-ignored: personal data).

| Script | What it does |
|---|---|
| `analyse-segment.js` | Opens `/analysis`, marks the court with two short service lines (net-post view), analyses one range, saves the session JSON. `APP_URL` defaults to `http://localhost:3000`. |
| `head-boxes.ts` | From a session JSON: where each tracked player's head is in each 1-s frame (for face matching). |
| `whoswho.ts` + `whoswho.py` | Picture of each tracked player at four moments, to name them. |
| `faces.py` | Face matching against VACA profile photos (YuNet + SFace, OpenCV Zoo, Apache-2.0). See its `--help`. |

## Typical run (one 5-minute part)

```bash
# Playwright's Chromium can't play the iPhone's HEVC: convert first.
ffmpeg -i IMG_6054.MOV -vf scale=1280:720 -c:v libvpx-vp9 -b:v 2500k -deadline realtime -cpu-used 8 -c:a libopus lab-data/IMG_6054.webm

# analyse 0-300 s, court marked on the frame at 100 s (points in 1280x720 pixels)
node analyse-segment.js lab-data/IMG_6054.webm 0 300 100 '[[352,553],[530,429],[762,419],[928,527]]' lab-data/v54a-session.json

# who's who picture
npx tsx whoswho.ts lab-data/v54a-session.json > lab-data/v54a-who.json
(cd lab-data && python3 ../whoswho.py IMG_6054.webm v54a-who.json v54a-who.png)

# face matching (pip install opencv-python-headless==4.10.0.84 numpy)
curl -s https://vacabc.my/api/players > lab-data/vaca-players.json
python3 faces.py vaca --players lab-data/vaca-players.json
mkdir -p lab-data/frames/IMG_6054 && ffmpeg -i IMG_6054.MOV -t 300 -vf fps=1 lab-data/frames/IMG_6054/%04d.png
npx tsx head-boxes.ts lab-data/v54a-session.json lab-data/boxes-v54a.json
python3 faces.py video --frames lab-data/frames/IMG_6054 --boxes lab-data/boxes-v54a.json --name v54a
python3 faces.py match --name v54a
```
