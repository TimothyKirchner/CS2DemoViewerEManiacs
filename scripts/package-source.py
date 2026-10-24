"""Create and verify a complete source archive without local build caches."""
import json, os, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
target = root.parent / f'Strat-Scope-{version}-Source.zip'
excluded = {'node_modules', 'release', '.git', '.smoke-profile', '__pycache__', 'portable'}
files = []
for folder, dirs, names in os.walk(root):
    dirs[:] = [d for d in dirs if d not in excluded]
    files.extend(pathlib.Path(folder) / n for n in names)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in files:
        archive.write(file, pathlib.Path(root.name) / file.relative_to(root))
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    for file in files:
        assert archive.read((pathlib.Path(root.name) / file.relative_to(root)).as_posix()) == file.read_bytes()
print(f'Verified {len(files)} files: {target} ({target.stat().st_size:,} bytes)')
