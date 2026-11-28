"""Find where a 'still' phone was moved and where the court marks belong after each move.

usage: python3 realign.py <video> <ref_time> '<points json, 1280x720 px>' [step_s]
Prints JSON: [{"from": s, "to": s, "points": [[x,y],...]}] — one entry per stretch where the
view stays put. Points are mapped with a homography from ORB features on the hall (walls,
lights, lines), which do not move; players are a small part of the picture.
"""
import json, subprocess, sys
import cv2, numpy as np

video, ref_t, pts_json = sys.argv[1], float(sys.argv[2]), sys.argv[3]
step = float(sys.argv[4]) if len(sys.argv) > 4 else 2.0
W, H = 1280, 720
dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]))

def frame(t):
    raw = subprocess.check_output(['ffmpeg', '-loglevel', 'error', '-ss', str(t), '-i', video, '-frames:v', '1', '-vf', f'scale={W}:{H},format=gray', '-f', 'rawvideo', '-'])
    return np.frombuffer(raw, np.uint8).reshape(H, W)

orb = cv2.ORB_create(3000)
ref = frame(ref_t)
kr, dr = orb.detectAndCompute(ref, None)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
P = np.float32(json.loads(pts_json)).reshape(-1, 1, 2)

rows = []
t = 0.0
while t < dur - 0.5:
    f = frame(t)
    k, d = orb.detectAndCompute(f, None)
    pts = None
    if d is not None and len(k) > 50:
        m = sorted(bf.match(dr, d), key=lambda x: x.distance)[:800]
        if len(m) > 40:
            a = np.float32([kr[x.queryIdx].pt for x in m]).reshape(-1, 1, 2)
            b = np.float32([k[x.trainIdx].pt for x in m]).reshape(-1, 1, 2)
            Hm, inl = cv2.findHomography(a, b, cv2.RANSAC, 4.0)
            if Hm is not None and inl.sum() > 30:
                pts = cv2.perspectiveTransform(P, Hm).reshape(-1, 2)
    rows.append((t, pts))
    t += step

# Group consecutive samples whose mapped points stay within 6 px of the group's first.
segs = []
for t, pts in rows:
    if pts is None:
        if segs: segs[-1]['to'] = t
        continue
    s = segs[-1] if segs else None
    if s and np.abs(np.array(s['points']) - pts).max() < 6:
        s['to'] = t + step
    else:
        segs.append({'from': t, 'to': t + step, 'points': np.round(pts).astype(int).tolist()})
for s in segs:
    s['to'] = round(min(dur, s['to']), 1)
segs = [s for s in segs if s['to'] - s['from'] >= 10]
print(json.dumps(segs))
