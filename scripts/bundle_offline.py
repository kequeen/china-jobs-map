"""Bundle the same page into one self-contained, offline HTML artifact."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / "dist/index.html").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (ROOT / "dist/styles.css").read_text(encoding="utf-8") + '</style>')
scripts = ("data.js", "treemap.js", "app.js")
for asset in scripts:
    html = html.replace(f'<script src="{asset}" defer></script>', "")
inline = "\n".join("<script>" + (ROOT / "dist" / asset).read_text(encoding="utf-8") + "</script>" for asset in scripts)
html = html.replace("</body>", inline + "\n</body>").replace('href="data.json"', 'href="dist/data.json"')
target = ROOT / "china-jobs.html"
target.write_text(html, encoding="utf-8")
print(f"Offline artifact: {target.name} ({target.stat().st_size} bytes)")

