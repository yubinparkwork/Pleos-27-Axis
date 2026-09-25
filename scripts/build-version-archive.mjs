import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, symlink, cp, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareVersion } from './prepare-version-compatibility.mjs';
const root = path.resolve(import.meta.dirname, '..');
const versions = JSON.parse(await readFile(path.join(root, 'versions.json'), 'utf8'));
for (const version of versions) {
  if(version.localBuild){await access(path.join(root,'public/versions',version.id,'index.html'));continue;}
  if (!/^[a-z0-9-]+$/.test(version.id)) throw new Error('Invalid version id');
  const sha = execFileSync('git', ['rev-parse', `${version.commit}^{commit}`], {cwd:root, encoding:'utf8'}).trim();
  const dest = path.join(root, 'public/versions', version.id);
  try { if ((await readFile(path.join(dest, 'source-sha.txt'), 'utf8')) === sha) continue; } catch {}
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pleos-version-'));
  const archive = execFileSync('git', ['archive', sha], {cwd:root, maxBuffer:512*1024*1024});
  execFileSync('tar', ['-xf', '-', '-C', temp], {input:archive});
  await symlink(path.join(root, 'node_modules'), path.join(temp, 'node_modules'));
  // Build immutable source without running historical package lifecycle scripts.
  execFileSync(process.execPath, [path.join(root,'node_modules/vite/bin/vite.js'), 'build', '--base', './'], {cwd:temp, stdio:'inherit'});
  await mkdir(dest, {recursive:true});
  await cp(path.join(temp,'dist'), dest, {recursive:true});
  let html = await readFile(path.join(dest,'index.html'),'utf8');
  const prefix = `pleos-history:${version.id}:`;
  // Execute before any historical module. Separate all localStorage keys by version.
  const isolation = `<script>(()=>{const s=window.localStorage,p=${JSON.stringify(prefix)};Object.defineProperty(window,'localStorage',{value:{getItem:k=>s.getItem(p+k),setItem:(k,v)=>s.setItem(p+k,v),removeItem:k=>s.removeItem(p+k),clear:()=>Object.keys(s).filter(k=>k.startsWith(p)).forEach(k=>s.removeItem(k)),key:i=>Object.keys(s).filter(k=>k.startsWith(p))[i]?.slice(p.length)??null,get length(){return Object.keys(s).filter(k=>k.startsWith(p)).length}}})})()</script>`;
  html = html.replace('<head>', `<head>${isolation}`).replace('</body>', '<script src="../../version-menu.js" defer></script></body>');
  await writeFile(path.join(dest,'index.html'),html);
  await writeFile(path.join(dest,'source-sha.txt'),sha);
}
const catalog = [];
for (const version of versions) catalog.push(await prepareVersion(root,version));
await writeFile(path.join(root,'public/version-catalog.json'),JSON.stringify(catalog,null,2));
console.log('Version archive ready:', versions.map(v=>v.id).join(', '));
