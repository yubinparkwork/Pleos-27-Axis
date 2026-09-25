import { cp, readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Never rewrite an immutable checkpoint. Fix only its derived runnable copy.
export async function prepareVersion(root, version) {
  if (!version.localBuild) return version;
  const routeId = version.id + '-compatible';
  const source = path.join(root, 'public/versions', version.id);
  const dest = path.join(root, 'public/versions', routeId);
  const marker = path.join(dest, 'compatibility.json');
  try { if (JSON.parse(await readFile(marker, 'utf8')).revision === 2) return {...version, routeId}; } catch {}
  await mkdir(dest, {recursive:true});
  await cp(source, dest, {recursive:true});
  for (const file of await readdir(path.join(dest,'assets'))) {
    if (!file.endsWith('.js')) continue;
    const filename = path.join(dest,'assets',file);
    const original = await readFile(filename,'utf8');
    const repaired = original.replace(/(["'])\/Pleos-27-Axis\/([^"']*)\1/g,
      (_, quote, suffix) => `(new URL(${JSON.stringify('../'+suffix)},import.meta.url).href)`);
    if (repaired !== original) await writeFile(filename,repaired);
  }
  await writeFile(marker,JSON.stringify({revision:2,sourceId:version.id,change:'Only deployment-base URL resolution; original storage namespace and visual code retained'},null,2));
  return {...version,routeId};
}
