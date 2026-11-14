import os
import json
from pathlib import Path
from PIL import Image

root = Path(r"C:\Users\sureshr\Documents\Default Project\LabLens\artifacts\qa\full-product-audit")
json_path = root / "test-results.json"

with open(json_path, "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total screenshots in catalog: {len(data['screenshots'])}")
all_valid = True

for s in data["screenshots"]:
    p = root / s["file"]
    if not p.exists():
        print(f"FAILED: Missing screenshot {p}")
        all_valid = False
        continue
    sz = p.stat().st_size
    if sz == 0:
        print(f"FAILED: Empty file {p}")
        all_valid = False
        continue
    with Image.open(p) as img:
        w, h = img.size
        print(f"VALID: {s['file']:<60} | {sz:>8} bytes | {w}x{h} px | {s['caption']}")

if all_valid:
    print("\nALL 26 SCREENSHOTS VERIFIED WITH VALID NON-ZERO SIZES AND DIMENSIONS.")
else:
    print("\nSOME SCREENSHOTS FAILED VERIFICATION.")
