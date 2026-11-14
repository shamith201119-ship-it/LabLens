import re

rest = "Hemoglobin A1c 6.2 %"
for m in re.finditer(r"([<>]=?\s*\d+(?:\.\d+)?(?:\s*[xX]\s*10\^?\d+)?)", rest):
    print("found:", m.group(1), "span:", m.span(), "before:", rest[m.start()-1:m.start()] if m.start()>0 else "^")
