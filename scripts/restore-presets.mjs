import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const bundle=JSON.parse(await readFile(path.join(root,'presets/optical-settings.json'),'utf8'));
if(bundle.version!==1||!Array.isArray(bundle.records))throw Error('Invalid preset archive');
const destination=path.resolve(process.env.PLEOS_PRESET_RESTORE_DIR??path.join(root,'.pleos/optical-state'));
await mkdir(destination,{recursive:true});
let restored=0,skipped=0;
for(const record of bundle.records){
  if(!/^pleos-optical-studio-v1(?::[a-z0-9:-]+)?$/.test(record.key)
    ||record.payload.version!==1||!record.payload.state)throw Error('Invalid preset record');
  const target=path.join(destination,encodeURIComponent(record.key)+'.json');
  try{await writeFile(target,JSON.stringify(record.payload,null,2)+'\n',{flag:'wx'});restored++;}
  catch(error){if(error.code==='EEXIST')skipped++;else throw error;}
}
console.log(`Presets restored: ${restored}; existing settings preserved: ${skipped}`);
