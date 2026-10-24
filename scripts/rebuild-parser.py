#!/usr/bin/env python3
"""Rebuild the bundled parser on Linux x64; requires Python 3.12+, Rust and patch."""
import hashlib,json,subprocess,tarfile,tempfile,urllib.request,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
REV='45ca85aeac8fb0de9d385124d2c7fe0e7b8ff0c8'
RUST='1.99.1'
BINDGEN='0.2.100'
def fingerprint(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 with tempfile.TemporaryDirectory(prefix='strat-scope-parser-') as d:
  work=Path(d)
  downloads=[('source.tar.gz','https://codeload.github.com/LaihoE/demoparser/tar.gz/'+REV,'565145f9284bb5cb7fd395c6a26465450d567a7149ae24c4b82dd3f99760053d'),('bindgen.tar.gz',f'https://github.com/wasm-bindgen/wasm-bindgen/releases/download/{BINDGEN}/wasm-bindgen-{BINDGEN}-x86_64-unknown-linux-musl.tar.gz','63d6a38deb65bd7023c02bdf382ab66b0d2c0241c8582fd3413b5a808b8aeb5b')]
  for name,url,sha in downloads:
   p=work/name
   with urllib.request.urlopen(url,timeout=180) as response:p.write_bytes(response.read())
   if fingerprint(p)!=sha:raise RuntimeError('Download checksum mismatch: '+name)
   with tarfile.open(p) as tar:tar.extractall(work,filter='data')
  source=work/('demoparser-'+REV);vendor=ROOT/'web/vendor';patch=vendor/'patches/wasm-compatibility.patch'
  subprocess.run(['patch','-p1','--batch','-i',str(patch)],cwd=source,check=True)
  subprocess.run(['cargo','+'+RUST,'build','--manifest-path','src/wasm/Cargo.toml','--target','wasm32-unknown-unknown','--release','--locked'],cwd=source,check=True)
  cli=work/f'wasm-bindgen-{BINDGEN}-x86_64-unknown-linux-musl/wasm-bindgen'
  subprocess.run([str(cli),str(source/'src/wasm/target/wasm32-unknown-unknown/release/demoparser2.wasm'),'--target','no-modules','--out-dir',str(work/'built'),'--out-name','demoparser2'],check=True)
  for name in ['demoparser2.js','demoparser2_bg.wasm']:shutil.copyfile(work/'built'/name,vendor/name)
  p=ROOT/'web/build-info.json';info=json.loads(p.read_text());info['parser']={'name':'demoparser2','revision':REV,'buildType':'compiled-from-source','rustVersion':RUST,'wasmBindgenVersion':BINDGEN,'wasmSha256':fingerprint(vendor/'demoparser2_bg.wasm'),'bindingsSha256':fingerprint(vendor/'demoparser2.js'),'compatibilityPatchSha256':fingerprint(patch)};p.write_text(json.dumps(info,indent=2)+'\n')
  print('Parser rebuilt. Run tests and demo regressions before packaging.')
if __name__=='__main__':main()
