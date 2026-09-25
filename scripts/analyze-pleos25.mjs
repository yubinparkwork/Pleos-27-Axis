/**
 * Offline reference analysis. Decodes a locally supplied reference, then fits
 * three crossing lines and six analytic light surfaces. No image data is kept.
 * Usage: node scripts/analyze-pleos25.mjs /tmp/pleos25-reference.mp4
 */
import { spawnSync } from 'node:child_process';

const input = process.argv[2] || '/tmp/pleos25-reference.mp4';
const width = 960;
const height = 540;
const rate = 10;
const decoded = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', input,
  '-vf', `select=not(mod(n\\,${30/rate})),scale=${width}:${height}`, '-fps_mode', 'vfr', '-pix_fmt', 'gray', '-f', 'rawvideo', '-'],
  { maxBuffer: 64 * 1024 * 1024 });
if (decoded.status !== 0) throw new Error(decoded.stderr.toString());
const count = Math.floor(decoded.stdout.length / (width * height));
const pi = Math.PI;
const mod = (a, b) => ((a % b) + b) % b;

function sample(data, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix + 1 >= width || iy + 1 >= height) return NaN;
  const fx = x - ix, fy = y - iy, p = iy * width + ix;
  return ((data[p] * (1 - fx) + data[p + 1] * fx) * (1 - fy)
    + (data[p + width] * (1 - fx) + data[p + width + 1] * fx) * fy) / 255;
}

function detect(data) {
  const energy = [], bins = 1800;
  for (let i = 0; i < bins; i++) {
    const a = i * pi / bins;
    let value = 0, n = 0;
    for (const sign of [-1, 1]) {
      for (let radius = 40; radius < 525; radius += 20) {
        const x = width / 2 + Math.cos(a) * radius * sign;
        const y = height / 2 + Math.sin(a) * radius * sign;
        const dx = -Math.sin(a), dy = Math.cos(a);
        const left = sample(data, x - dx * 1.1, y - dy * 1.1);
        const right = sample(data, x + dx * 1.1, y + dy * 1.1);
        if (Number.isFinite(left) && Number.isFinite(right)) {
          value += Math.abs(left - right);
          n++;
        }
      }
    }
    energy.push(value / Math.max(n, 1));
  }
  const peaks = [];
  for (let i = 0; i < bins; i++) {
    if (energy[i] >= energy[mod(i - 1, bins)] && energy[i] > energy[mod(i + 1, bins)]) {
      peaks.push({ angle: i / 10, energy: energy[i] });
    }
  }
  const selected = [];
  for (const p of peaks.sort((a, b) => b.energy - a.energy)) {
    if (selected.every(q => {
      const separation = Math.min(mod(q.angle - p.angle, 180), mod(p.angle - q.angle, 180));
      return separation > 7 || (separation > 2 && p.energy > q.energy * .5);
    })) selected.push(p);
    if (selected.length === 3) break;
  }
  return selected.sort((a, b) => a.angle - b.angle);
}

function continuousAngles(peaks, previous) {
  const sorted = peaks.map(p => p.angle * pi / 180);
  if (!previous) return sorted;
  let best, bestDistance = Infinity;
  for (let shift = 0; shift < 3; shift++) {
    const trial = Array.from({ length: 3 }, (_, j) => sorted[(j + shift) % 3] + (j + shift >= 3 ? pi : 0));
    const base = Math.round((previous[0] - trial[0]) / pi);
    for (let wrap = base - 1; wrap <= base + 1; wrap++) {
      const angles = trial.map(a => a + wrap * pi);
      const d = angles.reduce((sum, a, j) => sum + (a - previous[j]) ** 2, 0);
      if (d < bestDistance) { best = angles; bestDistance = d; }
    }
  }
  return best;
}

function solve(matrix, values) {
  const n = values.length;
  const m = matrix.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const v = m[col][col] || 1e-12;
    for (let k = col; k <= n; k++) m[col][k] /= v;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const s = m[row][col];
      for (let k = col; k <= n; k++) m[row][k] -= s * m[col][k];
    }
  }
  return m.map(row => row[n]);
}

function fitPlanes(data, angles) {
  const planes = [], bounds = [...angles, ...angles.map(a => a + pi), angles[0] + 2*pi];
  for (let plane = 0; plane < 6; plane++) {
    const start = bounds[plane], end = bounds[plane + 1];
    const pairs = [];
    for (let y = 5; y < height; y += 8) {
      for (let x = 5; x < width; x += 8) {
        const dx = (x - width / 2) / height, dy = (y - height / 2) / height;
        const a = mod(Math.atan2(dy, dx) - start, 2*pi);
        const t = a / (end - start);
        const r = Math.hypot(dx, dy);
        if (t > 0.02 && t < 0.98 && r > 0.03) {
          const basis = [1, t, t*t, t*t*t, r, r*t];
          pairs.push([basis, sample(data, x, y)]);
        }
      }
    }
    const n = 6;
    const matrix = Array.from({ length: n }, (_, j) => Array.from({ length:n }, (_, k) => j === k ? 0.00001 : 0));
    const values = Array(n).fill(0);
    for (const [basis, light] of pairs) {
      for (let j=0;j<n;j++) {
        values[j] += basis[j] * light;
        for(let k=0;k<n;k++) matrix[j][k] += basis[j]*basis[k];
      }
    }
    const coefficients = solve(matrix, values);
    let error = 0;
    for (const [basis, light] of pairs) {
      const predicted = coefficients.reduce((s, c, j) => s + c*basis[j], 0);
      error += (Math.min(1,Math.max(0,predicted)) - light)**2;
    }
    planes.push({ coefficients: coefficients.map(c => +c.toFixed(5)), error: +(Math.sqrt(error/Math.max(1,pairs.length))).toFixed(4) });
  }
  return planes;
}

function fitRays(data, angles, time) {
  const rays = [];
  for (const angle of [...angles, ...angles.map(a => a + pi)]) {
    const visible = [];
    const rmax = Math.min(width / 2 / Math.abs(Math.cos(angle)), height / 2 / Math.abs(Math.sin(angle))) / height;
    for (let r = 0.006; r < rmax - 0.003; r += 0.006) {
      const x = width / 2 + Math.cos(angle) * r * height;
      const y = height / 2 + Math.sin(angle) * r * height;
      let peak = 0;
      for (let shift = -1.5; shift <= 1.5; shift += 0.3) {
        peak = Math.max(peak, sample(data, x - Math.sin(angle)*shift, y + Math.cos(angle)*shift) || 0);
      }
      if (peak > .022) visible.push([r,peak]);
    }
    if (time > 1.75 && time < 6.45) { rays.push([0, 1.1, .09]); continue; }
    if (visible.length < 2) { rays.push([0,0,0]); continue; }
    const sorted = visible.map(v=>v[1]).sort((a,b)=>a-b);
    const intensity = Math.min(.14,sorted[Math.floor(sorted.length * .8)] * 1.5);
    rays.push([visible[0][0], visible.at(-1)[0]+.01, intensity].map(n=>+n.toFixed(5)));
  }
  return rays;
}

let previous;
const frames = [];
for (let i = 0; i < count; i++) {
  const data = decoded.stdout.subarray(i * width * height, (i + 1) * width * height);
  let peaks = detect(data);
  // Two distinct projected axes approach within 2.4° at this pose. A visual
  // check disambiguates them from one broad lighting-gradient maximum.
  if (i === 62) peaks = [86.8, 89.2, 179.2].map(angle => ({angle,energy:1}));
  const confident = peaks.length === 3 && peaks[0].energy > .001 && peaks[1].energy > .001 && peaks[2].energy > .001;
  if (!confident) {
    const early = [38.2, Math.max(38.4,peaks.at(-1)?.angle || 39), 134.2].map(a=>a*pi/180);
    const angles = i < 6 ? early : previous;
    const rays = fitRays(data, angles, i / rate);
    frames.push({ time: i / rate, angles: angles.map(a=>+(a*180/pi).toFixed(2)), coefficients: Array.from({length:6},()=>[0,0,0,0,0,0]), rays, errors:[0,0,0,0,0,0] });
    continue;
  }
  const angles = continuousAngles(peaks, previous);
  previous = angles;
  const planes = fitPlanes(data, angles);
  const rays = fitRays(data, angles, i/rate);
  frames.push({ time: i / rate, angles: angles.map(a=>+(a*180/pi).toFixed(2)), coefficients: planes.map(p=>p.coefficients), rays, errors: planes.map(p=>p.error) });
}
if (process.argv.includes('--preview')) {
  const time = Number(process.argv[process.argv.indexOf('--preview') + 1]);
  const frameIndex = Math.round(time * rate);
  const frame = frames[frameIndex];
  const source = decoded.stdout.subarray(frameIndex*width*height,(frameIndex+1)*width*height);
  const angles = frame.angles.map(a=>a*pi/180);
  const bounds = [...angles,...angles.map(a=>a+pi),angles[0]+2*pi];
  const pixels = Buffer.alloc(width*height);
  let squaredError = 0;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const dx=(x-width/2)/height,dy=(y-height/2)/height;
    const radius = Math.hypot(dx,dy);
    const theta = mod(Math.atan2(dy,dx)-angles[0],2*pi)+angles[0];
    let plane=0;
    while(plane<5 && theta>bounds[plane+1]) plane++;
    const t=(theta-bounds[plane])/(bounds[plane+1]-bounds[plane]);
    const c=frame.coefficients[plane];
    let value=Math.max(0,Math.min(1,c[0]+t*(c[1]+t*(c[2]+t*c[3]))+radius*(c[4]+c[5]*t)));
    for(let ray=0;ray<6;ray++) {
      const angle=bounds[ray],along=dx*Math.cos(angle)+dy*Math.sin(angle);
      const distance=Math.abs(dx*Math.sin(angle)-dy*Math.cos(angle))*height;
      const [start,end,intensity]=frame.rays[ray];
      if(along>=start && along<=end) value=Math.max(value,intensity*Math.max(0,1-distance/.8));
    }
    pixels[y*width+x]=Math.round(value*255);
    squaredError+=(value-source[y*width+x]/255)**2;
  }
  const output=`/tmp/pleos25-fit-${time}.png`;
  const result=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','gray','-video_size',`${width}x${height}`,'-i','-','-frames:v','1',output],{input:pixels});
  if(result.status!==0)throw new Error(result.stderr.toString());
  console.log(JSON.stringify({time,rmsError:Math.sqrt(squaredError/(width*height)),output}));
}
else if (process.argv.includes('--json')) {
  const keys = frames.filter(f=>f.time <= 8.8).map(f=>({time:f.time,angles:f.angles.map(a=>+(a*pi/180).toFixed(6)),planes:f.coefficients,rays:f.rays}));
  keys.push({...keys.at(-1),time:9.333333,planes:Array.from({length:6},()=>[0,0,0,0,0,0]),rays:Array.from({length:6},()=>[0,0,0])});
  console.log('{\n  "duration": 9.333333,\n  "coordinateSystem": "x right; y down; radius in image-height units; center 0.5,0.5",\n  "model": "six cubic angular light planes with linear radial slope; no raster samples",\n  "frames": [\n'+keys.map(f=>'    '+JSON.stringify(f)).join(',\n')+'\n  ]\n}');
}
else if (process.argv.includes('--full')) console.log(JSON.stringify(frames, null, 2));
else for (const frame of frames) console.log(JSON.stringify({time:frame.time,angles:frame.angles,errors:frame.errors,peaks:frame.peaks}));
