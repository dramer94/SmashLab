// Renders a short clip of a real video with the app's analysis overlay drawn on it.
// usage: PW_CHANNEL=chrome node render-clip.js <video> <session.json> <from> <to> <out.mp4> [theme] [names.json-entry-index]
// Names: set NAMES='{"near0":"AMER",...}' to label players. FOCUS='near0' highlights one player.
const { chromium } = require('playwright')
const { execFileSync, spawn } = require('child_process')
const fs = require('fs'), path = require('path')
const [video, sessionFile, from, to, out, theme = 'classic'] = process.argv.slice(2)
const FPS = Number(process.env.FPS || 25), W = 1280, H = 720
;(async () => {
  const bundle = path.join(__dirname, 'lab-data', '.render-bundle.js')
  execFileSync(path.join(__dirname, '../../node_modules/.bin/esbuild'), [path.join(__dirname, 'render-entry.ts'), '--bundle', '--format=iife', '--global-name=SL', '--outfile=' + bundle, '--log-level=warning'])
  const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'))
  const names = process.env.NAMES ? JSON.parse(process.env.NAMES) : {}
  for (const side of ['near', 'far']) session.settings.players[side] = session.settings.players[side].map((p, i) => ({ ...p, name: names[side + i] ?? p.name }))
  const page_html = path.join(path.dirname(path.resolve(video)), '.render.html')
  fs.writeFileSync(page_html, `<html><body style="margin:0;background:#000"><video id=v src="${path.basename(video)}" muted playsinline></video><canvas id=c width=${W} height=${H}></canvas><script src="${path.relative(path.dirname(page_html), bundle)}"></script></body></html>`)
  const b = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ['--allow-file-access-from-files'] })
  const p = await b.newPage()
  p.on('pageerror', e => console.log('pageerror:', e.message))
  await p.goto('file://' + page_html)
  await p.evaluate(async ({ session, theme, focus }) => {
    const v = document.getElementById('v')
    await new Promise(r => v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true }))
    window.model = SL.buildOverlayModel(session, SL.buildResult(session))
    window.fx = { ...SL.DEFAULT_EFFECTS, theme, autoReplay: false, endCard: false, watermark: false, showBrand: false, focus: focus ? { side: focus.slice(0, -1), slot: Number(focus.slice(-1)) } : null }
    window.focusKey = focus
  }, { session, theme, focus: process.env.FOCUS || null })
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
  const t0 = Number(from), t1 = Number(to)
  for (let t = t0; t <= t1; t += 1 / FPS) {
    const jpg = await p.evaluate(async (t) => {
      const v = document.getElementById('v'), c = document.getElementById('c'), ctx = c.getContext('2d')
      await new Promise(r => { v.addEventListener('seeked', r, { once: true }); v.currentTime = t })
      ctx.drawImage(v, 0, 0, c.width, c.height)
      SL.drawOverlay(ctx, c.width, c.height, t, model, { courtLines: false, miniMap: true, labels: true, shuttle: true }, { effects: fx })
      return c.toDataURL('image/jpeg', 0.85).split(',')[1]
    }, t)
    if (!ff.stdin.write(Buffer.from(jpg, 'base64'))) await new Promise(r => ff.stdin.once('drain', r))
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r))
  await b.close(); fs.unlinkSync(page_html)
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(1) + ' MB')
})()
