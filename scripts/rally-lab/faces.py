"""
Face matching lab tool: who is who in a Rally Analysis, using VACA profile photos.

Models (downloaded automatically, both OpenCV Zoo, Apache-2.0):
  YuNet face detector    https://huggingface.co/opencv/face_detection_yunet
  SFace face recogniser  https://huggingface.co/opencv/face_recognition_sface

Steps (all files under --data, default ./lab-data, which is git-ignored):
  1. vaca   download VACA profile photos and fingerprint their faces
              python3 faces.py vaca --players vaca-players.json
            (vaca-players.json = the JSON from https://vacabc.my/api/players)
  2. video  fingerprint faces of each tracked player in a clip
              python3 faces.py video --frames frames/IMG_6054 --boxes boxes-v54a.json --name v54a
            (frames: 1 fps PNGs of the ORIGINAL video for the analysed range, e.g.
               ffmpeg -i IMG_6054.MOV -ss 0 -t 300 -vf fps=1 frames/IMG_6054/%04d.png
             boxes: from `npx tsx head-boxes.ts <session.json> <boxes.json>`)
  3. match  suggest a VACA name for each tracked player
              python3 faces.py match --name v54a

Only use this for players who agreed to face matching. Keep photos, frames and
fingerprints out of git (they are personal data).
"""
import argparse, itertools, json, os, subprocess, sys, urllib.request

import cv2
import numpy as np

MODELS = {
    "face_detection_yunet_2023mar.onnx": "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": "https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx",
}
SLOTS = {"far0": "Far 1", "far1": "Far 2", "near0": "Near 1", "near1": "Near 2"}


def models(data):
    d = os.path.join(data, "models")
    os.makedirs(d, exist_ok=True)
    for name, url in MODELS.items():
        p = os.path.join(d, name)
        if not os.path.exists(p):
            print("downloading", name)
            urllib.request.urlretrieve(url, p)
    det = cv2.FaceDetectorYN.create(os.path.join(d, "face_detection_yunet_2023mar.onnx"), "", (320, 320), 0.7, 0.3, 5000)
    rec = cv2.FaceRecognizerSF.create(os.path.join(d, "face_recognition_sface_2021dec.onnx"), "")
    return det, rec


def cmd_vaca(a):
    det, rec = models(a.data)
    players = [p for p in json.load(open(a.players)) if p.get("profilePicture")]
    pdir = os.path.join(a.data, "vaca-photos")
    os.makedirs(pdir, exist_ok=True)
    feats = {}
    for p in players:
        url = p["profilePicture"] if p["profilePicture"].startswith("http") else a.site + p["profilePicture"]
        path = os.path.join(pdir, p["id"] + ".img")
        if not os.path.exists(path):
            subprocess.run(["curl", "-sL", "-o", path, url], check=False)
        img = cv2.imread(path)
        if img is None:
            continue
        s = 800 / max(img.shape[:2])
        if s < 1:
            img = cv2.resize(img, None, fx=s, fy=s)
        det.setInputSize((img.shape[1], img.shape[0]))
        _, faces = det.detect(img)
        if faces is None:
            continue
        f = max(faces, key=lambda r: r[2] * r[3])
        feats[p["name"]] = rec.feature(rec.alignCrop(img, f)).flatten()
    np.save(os.path.join(a.data, "vaca-feats.npy"), feats, allow_pickle=True)
    print("VACA players with a usable face:", len(feats), "of", len(players))


def cmd_video(a):
    det, rec = models(a.data)
    boxes = json.load(open(a.boxes))
    byframe = {}
    for b in boxes:
        byframe.setdefault(b["frame"], []).append(b)
    feats, found = {}, 0
    for fr, bs in sorted(byframe.items()):
        img = cv2.imread(os.path.join(a.frames, "%04d.png" % fr))
        if img is None:
            continue
        det.setInputSize((img.shape[1], img.shape[0]))
        _, faces = det.detect(img)
        if faces is None:
            continue
        for f in faces:
            x, y, w, h = f[:4]
            cx, cy = x + w / 2, y + h / 2
            found += 1
            for b in bs:  # the tracked player whose head area holds this face
                m = b["size"] * 0.6
                if b["x0"] - m <= cx <= b["x0"] + b["size"] + m and b["y0"] - m <= cy <= b["y0"] + b["size"] + m:
                    feats.setdefault(b["key"], []).append(rec.feature(rec.alignCrop(img, f)).flatten())
                    break
    np.save(os.path.join(a.data, "feats-%s.npy" % a.name), {k: np.array(v) for k, v in feats.items()}, allow_pickle=True)
    print("faces found:", found, "| on tracked players:", {SLOTS[k]: len(v) for k, v in feats.items()})
    sim = lambda u, v: float(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v)))
    allf = [(k, x) for k, v in feats.items() for x in v]
    if len(allf) > 1:
        ok = sum(max(((sim(x, y), k2) for j, (k2, y) in enumerate(allf) if j != i))[1] == k for i, (k, x) in enumerate(allf))
        print("consistency: nearest face is the same player %d of %d" % (ok, len(allf)))


def cmd_match(a):
    vaca = np.load(os.path.join(a.data, "vaca-feats.npy"), allow_pickle=True).item()
    feats = np.load(os.path.join(a.data, "feats-%s.npy" % a.name), allow_pickle=True).item()
    names = list(vaca)
    V = np.array([vaca[n] / np.linalg.norm(vaca[n]) for n in names])
    for k, label in SLOTS.items():
        F = feats.get(k)
        if F is None or len(F) < 5:
            print("%-7s too few faces" % label)
            continue
        F = F / np.linalg.norm(F, axis=1, keepdims=True)
        S = F @ V.T  # faces x VACA people
        score = np.sort(S, axis=0)[-max(5, len(F) // 5):].mean(axis=0)  # each person's best 20% of matches
        votes = np.bincount(S.argmax(axis=1), minlength=len(names)) / len(F)
        order = np.argsort(-score)
        margin = score[order[0]] - score[order[1]]
        conf = "high" if votes[order[0]] >= 0.4 and margin >= 0.08 else "medium" if votes[order[0]] >= 0.25 and margin >= 0.05 else "low"
        top = ", ".join("%s %.2f (%d%%)" % (names[i], score[i], round(votes[i] * 100)) for i in order[:3])
        print("%-7s %3d faces  %-6s -> %s" % (label, len(F), conf, top))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default="lab-data")
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("vaca"); v.add_argument("--players", required=True); v.add_argument("--site", default="https://vacabc.my")
    w = sub.add_parser("video"); w.add_argument("--frames", required=True); w.add_argument("--boxes", required=True); w.add_argument("--name", required=True)
    m = sub.add_parser("match"); m.add_argument("--name", required=True)
    a = ap.parse_args()
    {"vaca": cmd_vaca, "video": cmd_video, "match": cmd_match}[a.cmd](a)
