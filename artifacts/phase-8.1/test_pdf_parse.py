import fitz
import importlib.util

spec = importlib.util.spec_from_file_location("line_parser", "artifacts/phase-8.1/test_line_parser.py")
lp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lp)

doc = fitz.open("backend/tests/fixtures/phase8_1_accuracy/clean_digital_report.pdf")
text = doc[0].get_text()
doc.close()

print("Extracted from clean_digital_report.pdf:")
for line in text.splitlines():
    res = lp.parse_line(line)
    if res:
        print(f"  {res['test']:20} -> {res['val_num']} {res['unit']} [{res['ref_str']}] {res['derived']}")
    else:
        print(f"  [SKIPPED] {line}")
