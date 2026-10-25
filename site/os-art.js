(function(){
// Turns a photograph shot on black into living ASCII. Two looks, both taken from the references:
//   'dots'   — halftone: one round dot per cell, its size set by brightness, its colour by the photo.
//   'glyphs' — dense characters chosen by brightness and tinted by the photo.
// The background drops out completely (cells below `threshold`), so only the subject is drawn.
// It appears as the canvas first comes into view, then breathes: a soft band of light drifts across,
// a few glyphs swap, cells near the pointer move aside. Drawn only while on screen, at ~30 fps.
//
// `cell` and `cropX` may be functions of the canvas width, so the framing follows window resizes.
const clamp = v => Math.max(0, Math.min(255, v | 0));
const GLYPHS = ' .:-=+oa*#%@8';

function asciiImage(canvas, {
  src, mode = 'dots', cell: cellOpt = 8, fit = 'width', crop = [0, 1], cropX: cropXOpt = [0, 1],
  threshold = 0.07, gamma = 0.75, spark = null, glow = null,
  regions = null, tints = [], focus = null,   // optional: name a region per cell (photo fractions) and light one up on demand
  light = false,                              // drawn as ink on a light page: same hues, darkened; glow and spark in cool blue-grey
} = {}) {
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pointer = { x: -1e4, y: -1e4 };
  let cells = [], w = 0, h = 0, dpr = 1, cell = 8, rowH = 8, map = null;
  let visible = false, start = 0, last = 0, frame = 0, near = 0, shown = -1, fade = 0;

  function sample() {
    const box = canvas.getBoundingClientRect();
    w = box.width; h = box.height;
    if (!w || !h) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    cell = typeof cellOpt === 'function' ? cellOpt(w) : cellOpt;
    const cropX = typeof cropXOpt === 'function' ? cropXOpt(w) : cropXOpt;
    rowH = mode === 'glyphs' ? cell * 1.22 : cell;

    // Source window of the photo, and where it lands on the canvas.
    const sx = cropX[0] * img.width, sw = (cropX[1] - cropX[0]) * img.width;
    const sy = crop[0] * img.height, sh = (crop[1] - crop[0]) * img.height;
    const s = fit === 'contain' ? Math.min(w / sw, h / sh) : w / sw;
    const dw = sw * s, dh = sh * s, dx = (w - dw) / 2, dy = (h - dh) / 2;
    map = { sx, sy, s, dx, dy };

    // Downsample in halving steps so each cell is a true average of its patch of the photo.
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / rowH);
    let src = img, srcRect = [sx, sy, sw, sh], tw = cols * 8, th = rows * 8;
    while (true) {
      const c = document.createElement('canvas'); c.width = tw; c.height = th;
      const g = c.getContext('2d', { willReadFrequently: tw === cols });
      g.imageSmoothingQuality = 'high';
      if (src === img) g.drawImage(img, ...srcRect, dx / w * tw, dy / h * th, dw / w * tw, dh / h * th);
      else g.drawImage(src, 0, 0, tw, th);
      src = c;
      if (tw === cols) break;
      tw = Math.max(cols, tw >> 1); th = Math.max(rows, th >> 1);
    }
    const data = src.getContext('2d').getImageData(0, 0, cols, rows).data;

    cells = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = (y * cols + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      const raw = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (raw < threshold) continue;
      // Lift the mid tones so skin and shadowed petals read as clearly as the white highlights; keep the hue.
      // Contrast: an S-curve spreads the mid tones apart, then a gentle lift so skin and shadowed petals still read.
      const c = (raw - threshold) / (1 - threshold), sc = c < 0.5 ? 2 * c * c : 1 - 2 * (1 - c) * (1 - c);
      const lum = Math.min(1, Math.pow(sc, gamma));
      const k = Math.min(2.1, (0.5 + lum * 0.72) / Math.max(raw, 0.15));
      // A little extra saturation so the warm heart and the skin keep their colour once broken into glyphs.
      const m = (r + g + b) / 3, sat = 1.35;
      const R = m + (r - m) * sat, G = m + (g - m) * sat, B = m + (b - m) * sat;
      const px = x * cell + cell / 2, py = y * rowH + rowH / 2;
      const region = regions ? regions((sx + (px - dx) / s) / img.width, (sy + (py - dy) / s) / img.height) : -1;
      cells.push({
        x: px, y: py, lum, seed: Math.random(), region,
        color: light ? `rgb(${clamp(30 + (R - m) * 0.55)},${clamp(42 + (G - m) * 0.55)},${clamp(58 + (B - m) * 0.55)})` : `rgb(${clamp(R * k)},${clamp(G * k)},${clamp(B * k)})`,
      });
    }
  }

  function draw(now) {
    if (!canvas.isConnected) return;
    frame = requestAnimationFrame(draw);
    if (!cells.length || (now - last < 33 && !reduce)) return;
    const box = canvas.getBoundingClientRect();
    visible = box.bottom > 0 && box.top < innerHeight;
    if (!visible) return;
    last = now;
    if (!start) start = now;
    const t = (now - start) / 1000, reveal = reduce ? 1 : Math.min(1, t / 1.4);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (mode === 'glyphs') { ctx.font = `500 ${cell * 1.36}px "JetBrains Mono", ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }

    if (glow && map) {
      // A warm light behind the subject (photo fractions), like the copper heart of the reference flower.
      const gx = map.dx + (glow[0] * img.width - map.sx) * map.s, gy = map.dy + (glow[1] * img.height - map.sy) * map.s;
      const gr = Math.min(w, h) * 0.32 * (reduce ? 1 : 0.94 + 0.06 * Math.sin(t * 1.1)), g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      if (light) { g.addColorStop(0, `rgba(150,190,222,${0.32 * reveal})`); g.addColorStop(0.45, `rgba(190,214,232,${0.14 * reveal})`); g.addColorStop(1, 'rgba(246,248,251,0)'); }
      else { g.addColorStop(0, `rgba(255,150,70,${0.3 * reveal})`); g.addColorStop(0.4, `rgba(220,110,50,${0.1 * reveal})`); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    // One region lit at a time: the old one fades out before the new one fades in.
    const want = focus ? focus() : -1;
    if (want !== shown) { fade -= reduce ? 1 : 0.2; if (fade <= 0) { shown = want; fade = 0; } }
    else if (shown >= 0) fade = Math.min(1, fade + (reduce ? 1 : 0.14));
    const R = 110, band = (w + h) * 0.9;
    for (const c of cells) {
      // Appear: each cell fades in at its own moment, nearer the centre first.
      const order = c.seed * 0.55 + (Math.abs(c.x - w / 2) / w) * 0.45;
      if (order > reveal) continue;
      let lum = c.lum, x = c.x, y = c.y;
      if (!reduce) {
        // A soft band of light drifting diagonally every few seconds.
        const p = ((c.x + c.y * 0.6) / band - t * 0.12) % 1;
        lum = Math.min(1, lum * (1 + 0.35 * Math.pow(Math.max(0, Math.cos((p < 0 ? p + 1 : p) * Math.PI * 2)), 40)));
        const dx = c.x - pointer.x, dy = c.y - pointer.y, d = Math.hypot(dx, dy);
        if (d < R) { const f = 1 - d / R; x += dx / (d || 1) * f * 12; y += dy / (d || 1) * f * 12; lum = Math.min(1, lum + f * 0.25); }
      }
      let dim = 1, color = c.color;
      if (shown >= 0 && fade > 0) {
        if (c.region === shown) { lum = Math.min(1, lum * (1 + 0.3 * fade) + 0.12 * fade); if (fade > 0.35) color = tints[shown] || color; }
        else dim = 1 - 0.74 * fade;
      }
      ctx.fillStyle = color;
      if (mode === 'dots') {
        ctx.globalAlpha = dim; ctx.beginPath(); ctx.arc(x, y, cell * 0.5 * Math.sqrt(lum), 0, Math.PI * 2); ctx.fill();
      } else {
        const swap = !reduce && Math.sin(t * 1.7 + c.seed * 60) > 0.985 ? 1 : 0;
        ctx.globalAlpha = (0.72 + lum * 0.28) * dim;
        ctx.fillText(GLYPHS[Math.min(GLYPHS.length - 1, Math.max(1, Math.round(lum * (GLYPHS.length - 1)) + swap))], x, y);
      }
    }
    ctx.globalAlpha = 1;

    if (spark && map) {
      // `spark` is in photo fractions. The closer the pointer comes, the brighter and wider it gets.
      const sx = map.dx + (spark[0] * img.width - map.sx) * map.s, sy = map.dy + (spark[1] * img.height - map.sy) * map.s;
      near += (Math.max(0, 1 - Math.hypot(pointer.x - sx, pointer.y - sy) / 260) - near) * 0.08;
      const pulse = (reduce ? 0.6 : 0.55 + 0.45 * Math.sin(t * (2.4 + near * 3))) * reveal + near * 0.6;
      const r = 60 + pulse * 30 + near * 60, g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      if (light) { g.addColorStop(0, `rgba(120,168,206,${Math.min(0.75, 0.45 * pulse)})`); g.addColorStop(0.3, `rgba(160,196,224,${0.16 * pulse})`); g.addColorStop(1, 'rgba(246,248,251,0)'); }
      else { g.addColorStop(0, `rgba(255,236,200,${Math.min(0.9, 0.55 * pulse)})`); g.addColorStop(0.25, `rgba(255,190,120,${0.18 * pulse})`); g.addColorStop(1, 'rgba(0,0,0,0)'); }
      ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      ctx.fillStyle = light ? `rgba(36,49,66,${Math.min(1, 0.7 + 0.3 * pulse)})` : `rgba(255,245,225,${Math.min(1, 0.7 + 0.3 * pulse)})`; ctx.beginPath(); ctx.arc(sx, sy, 2.2 + pulse * 1.2, 0, Math.PI * 2); ctx.fill();
    }
  }

  canvas.addEventListener('pointermove', e => { const b = canvas.getBoundingClientRect(); pointer.x = e.clientX - b.left; pointer.y = e.clientY - b.top; });
  canvas.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
  new ResizeObserver(() => img.complete && img.naturalWidth && sample()).observe(canvas);
  img.onload = () => { (document.fonts?.ready ?? Promise.resolve()).then(sample); };
  img.src = src;
  frame = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(frame);
}

// The "one decision" demo: the morning plan waits for approval; once approved, each task goes
// queued → building → in review → waiting for you, and opens its receipt. Illustrative only.
const STATES = {
  wait: 'Waiting for approval',
  queued: 'Queued',
  build: 'Building',
  review: 'In review',
  ready: 'Ready for you',
};

function demo(root) {
  const items = [...root.querySelectorAll('.os__task')];
  const approve = root.querySelector('[data-approve]');
  const replay = root.querySelector('[data-replay]');
  const status = root.querySelector('[data-status]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];

  function set(el, s) {
    el.dataset.state = s;
    el.querySelector('.os__state').textContent = STATES[s];
  }

  function reset() {
    timers.forEach(clearTimeout); timers = [];
    items.forEach(el => set(el, 'wait'));
    approve.hidden = false; replay.hidden = true;
    status.textContent = 'Proposed at 07:30 by Operations';
  }

  function run() {
    approve.hidden = true;
    status.textContent = 'Approved just now';
    const step = reduce ? 0 : 1;
    items.forEach((el, i) => {
      const at = (ms, fn) => timers.push(setTimeout(fn, ms * step));
      const base = i * 900;
      at(0, () => set(el, 'queued'));
      at(base + 500, () => set(el, 'build'));
      at(base + 2300, () => set(el, 'review'));
      at(base + 3700, () => {
        set(el, 'ready');
        if (i === items.length - 1) { status.textContent = `${items.length} results waiting for you · nothing sent`; replay.hidden = false; }
      });
    });
  }

  approve.addEventListener('click', run);
  replay.addEventListener('click', () => { reset(); });
  reset();
}

const lobes=(()=>{const jitter=(x,y)=>0.018*Math.sin(y*41+x*7)+0.012*Math.sin(x*57-y*13);return[
(x,y)=>y>0.68&&x>0.5&&x<0.67?5:-1,
(x,y)=>((x-0.69)/0.15)**2+((y-0.68)/0.085)**2<1?4:-1,
(x,y)=>x>0.27&&x<0.84&&y<0.69&&y>0.555-(x-0.3)*0.27+jitter(x,y)?1:-1,
(x,y)=>x<0.4+(0.5-y)*0.3+jitter(x,y)?0:-1,
(x,y)=>x>0.74+(y-0.3)*0.22+jitter(x,y)?3:-1,
()=>2]})();
// The phonebox rig: a rack of real phones, each scrolling its own feed of halftone reels.
// Every few seconds one phone publishes: its screen fills and a mark rises. Ink only; dark mode inverts the canvas.
function rig(canvas,{cols:colsOpt=5,rows:rowsOpt=2}={}){
  const ctx=canvas.getContext('2d'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,pointer={x:-1e4,y:-1e4};
  let w=0,h=0,dpr=1,phones=[],frame=0,last=0,start=0,cols=5,rows=2;
  function layout(){const b=canvas.getBoundingClientRect();w=b.width;h=b.height;if(!w||!h)return;dpr=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    cols=typeof colsOpt==='function'?colsOpt(w):colsOpt;rows=typeof rowsOpt==='function'?rowsOpt(w):rowsOpt;
    const gap=Math.max(10,w*0.022),pw=Math.min((w-gap*(cols+1))/cols,((h-gap*(rows+1))/rows)/2.05),ph=pw*2.05;
    const ox=(w-(pw*cols+gap*(cols-1)))/2,oy=(h-(ph*rows+gap*(rows-1)))/2;
    phones=[];for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)phones.push({x:ox+c*(pw+gap),y:oy+r*(ph+gap),w:pw,h:ph,seed:Math.random()*100,speed:0.6+Math.random()*0.8,post:-10,lift:0});}
  function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  let nextPost=1.2;
  function draw(now){if(!canvas.isConnected)return;frame=requestAnimationFrame(draw);if(!phones.length||(now-last<33&&!reduce))return;
    const b=canvas.getBoundingClientRect();if(b.bottom<0||b.top>innerHeight)return;last=now;if(!start)start=now;
    const t=(now-start)/1000;
    if(!reduce&&t>nextPost){const p=phones[(Math.random()*phones.length)|0];p.post=t;nextPost=t+0.7+Math.random()*1.4;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    for(const p of phones){
      const hover=pointer.x>p.x&&pointer.x<p.x+p.w&&pointer.y>p.y&&pointer.y<p.y+p.h;p.lift+=((hover?1:0)-p.lift)*0.18;
      const y0=p.y-p.lift*6,rad=p.w*0.16;
      ctx.globalAlpha=1;ctx.lineWidth=1;ctx.strokeStyle='rgba(22,22,21,.55)';rr(p.x,y0,p.w,p.h,rad);ctx.stroke();
      const inset=p.w*0.07,sx=p.x+inset,sy=y0+inset*1.6,sw=p.w-inset*2,sh=p.h-inset*3.2;
      ctx.save();rr(sx,sy,sw,sh,rad*0.6);ctx.clip();
      const age=t-p.post,flash=age>=0&&age<1.2?1-age/1.2:0;
      const cell=Math.max(3,sw/11),scroll=reduce?0:t*p.speed*sh*0.18;
      ctx.fillStyle='#161615';
      for(let gy=-1;gy<sh/cell+1;gy++)for(let gx=0;gx<sw/cell;gx++){
        const vy=gy*cell+(scroll%cell),yy=gy+Math.floor(scroll/cell);
        const slide=Math.floor(yy/9),ly=(yy%9+9)%9;               // a reel is 9 rows tall
        const n=Math.sin(slide*12.9+p.seed)*43758.5,fr=n-Math.floor(n);
        const cx=(gx+0.5)/(sw/cell)-0.5,cy=ly/9-0.5;
        let v=fr>0.5?Math.max(0,0.5-Math.hypot(cx,cy*1.4)*1.1):Math.max(0,0.42-Math.abs(cy+0.15-fr*0.3)*1.6);
        v=Math.min(1,v*1.6+flash*0.75+(p.lift*0.15));
        if(v<0.06)continue;ctx.globalAlpha=0.35+0.65*v;ctx.beginPath();ctx.arc(sx+(gx+0.5)*cell,sy+vy,cell*0.5*Math.sqrt(v),0,Math.PI*2);ctx.fill();}
      ctx.restore();
      ctx.globalAlpha=0.5;ctx.fillStyle='#161615';ctx.beginPath();ctx.arc(p.x+p.w/2,y0+p.h-inset*0.8,Math.max(1.2,p.w*0.02),0,Math.PI*2);ctx.fill();
      if(flash>0){ctx.globalAlpha=flash;ctx.font=`500 ${Math.max(9,p.w*0.085)}px "Inter Tight",sans-serif`;ctx.textAlign='center';ctx.fillText('POSTED',p.x+p.w/2,y0-6-(1-flash)*10);}
    }ctx.globalAlpha=1;}
  canvas.addEventListener('pointermove',e=>{const b=canvas.getBoundingClientRect();pointer.x=e.clientX-b.left;pointer.y=e.clientY-b.top;});
  canvas.addEventListener('pointerleave',()=>{pointer.x=pointer.y=-1e4;});
  new ResizeObserver(layout).observe(canvas);layout();frame=requestAnimationFrame(draw);
}

window.__osLit=-1;
window.OSart={
hands:el=>asciiImage(el,{src:'os/hands.jpg',mode:'dots',light:true,cell:w=>w<720?5:7,spark:[0.5025,0.502],crop:[0.27,0.81],cropX:w=>w<720?[0.22,0.78]:[0,1]}),
flower:el=>asciiImage(el,{src:'os/poppy.jpg',mode:'glyphs',light:true,fit:'contain',cell:w=>w<560?5:6,crop:[0.17,0.97],cropX:[0.06,0.94],threshold:0.08,gamma:0.7,glow:[0.507,0.452]}),
brain:(el,tints)=>asciiImage(el,{src:'os/brain.jpg',mode:'glyphs',light:true,fit:'contain',cell:w=>w<560?5:6,crop:[0.13,0.87],cropX:[0.07,0.93],threshold:0.06,gamma:0.72,glow:[0.47,0.42],
 regions:(x,y)=>{for(const f of lobes){const r=f(x,y);if(r>=0)return r}return -1},tints,focus:()=>window.__osLit}),
demo:el=>demo(el),
rig:(el,o)=>rig(el,o),
handsWide:el=>asciiImage(el,{src:'os/hands.jpg',mode:'dots',light:true,cell:w=>w<720?4:6,spark:[0.5025,0.502],crop:[0.3,0.78],cropX:[0.14,0.86]})};
})();