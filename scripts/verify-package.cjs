const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const packed=path.resolve(process.argv[2]||path.join(root,'release/win-unpacked'));
const archive=path.join(packed,'resources/app.asar');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function files(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
const manifest={};
for(const file of [...files('web'),...files('desktop'),'assets/icon.png','package.json']){
  const source=fs.readFileSync(path.join(root,file));
  const packaged=asar.extractFile(archive,path.normalize(file));
  if(file==='package.json'){
    const a=JSON.parse(packaged),b=JSON.parse(source);
    for(const key of ['name','version','main','productName'])assert.equal(a[key],b[key],`package metadata ${key}`);
  }else assert.equal(hash(packaged),hash(source),`packaged bytes: ${file}`);
  manifest[file]=hash(source);
}
for(const file of ['README.txt','ANALYSIS.md','FEATURE_VERIFICATION.md','THIRD_PARTY_NOTICES.txt'])assert.equal(hash(fs.readFileSync(path.join(packed,file))),hash(fs.readFileSync(path.join(root,file))),file);
fs.mkdirSync(path.join(root,'verification'),{recursive:true});
fs.writeFileSync(path.join(root,'verification/package-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Verified ${Object.keys(manifest).length} packaged files and README/notices against source.`);
