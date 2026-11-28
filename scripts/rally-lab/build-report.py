"""Fill the video-coach report page with coach.json + rendered clips.

usage: python3 build-report.py <coach.json> <clips.json> <template.html> <out_dir> [photos_dir]
Writes out_dir/index.html; clips are referenced as clips/<id>.mp4 and photos as p/<name>.jpg
(copy them next to the page). Player data stays local: never commit out_dir.
"""
import json, os, sys

coach = json.load(open(sys.argv[1]))
clips = json.load(open(sys.argv[2]))
tpl = open(sys.argv[3]).read()
out = sys.argv[4]
photos = sys.argv[5] if len(sys.argv) > 5 else None

order = ["AMER"]  # Amer first, then the rest by shots credited
players = sorted(coach, key=lambda p: (p["name"] not in order, -p["totals"]["shots"]))
data = {"players": [], "notes": [
    "Each tip is a pattern only when it shows up in several parts.|A tip seen in 1 part is something to watch for, not a clear fault.",
    "Hits are found from sound.|In a noisy hall about 3 in 4 hits are caught during rallies; shot counts and the shot mix are estimates.",
    "Who hit a shot is the weakest part in doubles.|Some of your shots may be credited to your partner and the other way round. Check the clips before acting on shot advice.",
    "Speeds are estimates|from where the players stood, not from a speed gun.",
    "Errors and winners are left out|because who won each rally hasn't been set.",
]}
for p in players:
    mine = [c for c in clips if c["player"] == p["name"] and os.path.exists(os.path.join(out, "clips", c["id"] + ".mp4"))]
    notes = []
    if len(p["parts"]) == 1:
        notes.append("Only one 5-minute part.|Everything here comes from a single stretch of play.")
    if p["totals"]["shots"] < 15:
        notes.append(f"Only {p['totals']['shots']} shots were credited to you,|so the shot advice is thin.")
    imp = p["improve"][0] if p["improve"] else None
    keep = p["strengths"][0] if p["strengths"] else None
    head = (f"Main thing to work on: {imp['title'].lower()}." if imp else "Nothing stood out to fix.") + (f" Keep doing: {keep['title'].lower()}." if keep else "")
    data["players"].append({
        "name": p["name"], "videos": p["videos"], "parts": p["parts"], "totals": p["totals"], "heat": p["heat"],
        "improve": p["improve"], "strengths": p["strengths"], "headline": head, "notes": notes,
        "photo": f"p/{p['name'].lower()}.jpg" if photos and os.path.exists(os.path.join(photos, p["name"].lower() + ".jpg")) else None,
        "clips": [{"src": f"clips/{c['id']}.mp4", "title": c["title"], "label": c["label"], "kind": c["kind"]} for c in mine],
    })
blob = json.dumps(data, separators=(",", ":")).replace("<", "\\u003c")
open(os.path.join(out, "index.html"), "w").write(tpl.replace("__DATA__", blob))
print(f"{len(data['players'])} players, {sum(len(p['clips']) for p in data['players'])} clips, {len(blob)//1024} KB data")
