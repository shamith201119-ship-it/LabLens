import re

line = "Glucose 112 mg/dL"
p2 = r"(?:^|(?<=[\s:]))((?:[<>]=?\s*)?\d+(?:\.\d+)?)(?=\s|$)"
print("p2 on 112:", re.findall(p2, line))

hba1c = "Hemoglobin A1c 6.2 %"
print("p2 on hba1c:", re.findall(p2, hba1c))

exp = "White Blood Cell Count 8.5 x10^3/uL"
p3 = r"(?:^|(?<=[\s:]))((?:[<>]=?\s*)?\d+(?:\.\d+)?(?:\s*[xX]\s*10(?:\^|\*\*|\^)?\d+)?)(?=\s|$)"
print("p3 on exp:", re.findall(p3, exp))
