import fitz

doc = fitz.open("backend/tests/fixtures/phase8_1_accuracy/clean_digital_report.pdf")
page = doc[0]
print("=== get_text() ===")
print(page.get_text())
print("=== get_text('layout') ===")
try:
    print(page.get_text("layout"))
except Exception as e:
    print("layout error:", e)
doc.close()
