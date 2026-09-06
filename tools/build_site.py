from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parent.parent
site=ROOT/'site';site.mkdir(exist_ok=True)
for name in ['index.html','app.js','market.js','.nojekyll']:
    shutil.copy2(ROOT/name,site/name)
for name in ['vendor','data']:
    target=site/name
    if target.exists():shutil.rmtree(target)
    shutil.copytree(ROOT/name,target)
print('Site built:',sum(p.stat().st_size for p in site.rglob('*') if p.is_file()),'bytes')
