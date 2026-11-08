from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
source = root / 'public' / 'citirpizza'
output = root / '.hoplite' / 'artifacts' / 'citirpizza-gosterim.zip'
files = ['index.html', 'app.js', 'styles.css', 'favicon.svg', 'menu.json',
         'admin.html', 'admin.js', 'admin.css', 'demo-store.js', 'YUKLEME.txt']
assets = sorted((source / 'images').glob('*'))
paths = [source / name for name in files] + assets
for path in paths:
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f'Expected regular presentation file: {path.name}')
    if path.suffix not in {'.html', '.js', '.css', '.svg', '.json', '.webp', '.txt'}:
        raise SystemExit(f'Unexpected asset type: {path.name}')
output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in paths:
        archive.write(path, Path('citirpizza') / path.relative_to(source))
print(f'{output.relative_to(root)}: {len(paths)} files, {output.stat().st_size:,} bytes')
