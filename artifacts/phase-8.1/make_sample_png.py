import os
from PIL import Image, ImageDraw

os.makedirs("artifacts/phase-8.1/test_fixtures", exist_ok=True)
img = Image.new("RGB", (600, 200), color="white")
d = ImageDraw.Draw(img)
d.text((30, 30), "TEST: Fasting Blood Glucose", fill="black")
d.text((30, 70), "RESULT: 95 mg/dL", fill="black")
d.text((30, 110), "REFERENCE: 70 - 99", fill="black")
target = "artifacts/phase-8.1/test_fixtures/sample_report.png"
img.save(target, format="PNG")
print("Created sample_report.png, size:", os.path.getsize(target))
