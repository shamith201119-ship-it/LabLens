import os
from pathlib import Path
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont

out_dir = Path(r"C:\Users\sureshr\Documents\Default Project\LabLens\artifacts\qa\full-product-audit\fixtures")
out_dir.mkdir(parents=True, exist_ok=True)

def create_pdf(filename: str, title: str, date_str: str, test_lines: list[str]):
    doc = fitz.open()
    page = doc.new_page(width=595, height=842) # A4
    
    # Header banner
    page.insert_text((50, 40), "SYNTHETIC QA DATA — NOT A REAL MEDICAL RECORD", fontsize=11, color=(0.8, 0.1, 0.1))
    page.insert_text((50, 70), "ACME CLINICAL LABORATORY (SYNTHETIC QA FACILITY)", fontsize=14, fontname="helv", color=(0.1, 0.2, 0.3))
    page.insert_text((50, 90), f"Document Title: {title}", fontsize=11, color=(0.2, 0.2, 0.2))
    page.insert_text((50, 105), f"Specimen Collection Date: {date_str}", fontsize=10, color=(0.2, 0.2, 0.2))
    page.insert_text((50, 120), "Patient Name: QA_TEST_SUBJECT_ALPHA (DO NOT USE FOR CLINICAL PURPOSES)", fontsize=10, color=(0.2, 0.2, 0.2))
    
    page.draw_line((50, 135), (545, 135), color=(0.5, 0.5, 0.5), width=1)
    
    # Table header
    page.insert_text((50, 155), "TEST NAME", fontsize=10, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text((220, 155), "RESULT", fontsize=10, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text((300, 155), "UNIT", fontsize=10, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text((380, 155), "REFERENCE INTERVAL", fontsize=10, fontname="helv", color=(0.1, 0.1, 0.1))
    page.insert_text((500, 155), "FLAG", fontsize=10, fontname="helv", color=(0.1, 0.1, 0.1))
    page.draw_line((50, 165), (545, 165), color=(0.3, 0.3, 0.3), width=1)
    
    y = 190
    for name, val, unit, ref, flag in test_lines:
        page.insert_text((50, y), name, fontsize=10)
        page.insert_text((220, y), val, fontsize=10)
        page.insert_text((300, y), unit, fontsize=10)
        page.insert_text((380, y), ref, fontsize=10)
        if flag:
            page.insert_text((500, y), flag, fontsize=10, color=(0.8, 0, 0))
        y += 24
        
    page.draw_line((50, y + 10), (545, y + 10), color=(0.7, 0.7, 0.7), width=0.5)
    page.insert_text((50, y + 35), "Lab Director: Dr. Synthetic QA, MD (Simulated)", fontsize=9, color=(0.4, 0.4, 0.4))
    page.insert_text((50, y + 50), "Notice: This document was programmatically generated for automated software QA verification.", fontsize=8, color=(0.5, 0.5, 0.5))
    
    file_path = out_dir / filename
    doc.save(str(file_path))
    doc.close()
    print(f"Generated PDF: {file_path}")

# Report A — Baseline
create_pdf(
    "qa_report_a.pdf",
    "Baseline Routine Comprehensive Panel",
    "2026-01-15",
    [
        ("Hemoglobin", "14.2", "g/dL", "13.0-17.0", ""),
        ("Fasting Blood Glucose", "92", "mg/dL", "70-99", ""),
        ("White Blood Cell Count", "6.5", "10^3/uL", "4.5-11.0", ""),
        ("Platelet Count", "250", "10^3/uL", "150-450", ""),
        ("Total Cholesterol", "185", "mg/dL", "125-200", ""),
        ("Creatinine", "0.9", "mg/dL", "0.6-1.2", "")
    ]
)

# Report B — Follow-up (Abnormal shifts)
create_pdf(
    "qa_report_b.pdf",
    "Follow-up Metabolic & Hematology Panel",
    "2026-06-20",
    [
        ("Hemoglobin", "11.2", "g/dL", "13.0-17.0", "LOW"),
        ("Fasting Blood Glucose", "148", "mg/dL", "70-99", "HIGH"),
        ("White Blood Cell Count", "7.1", "10^3/uL", "4.5-11.0", ""),
        ("Platelet Count", "230", "10^3/uL", "150-450", ""),
        ("Total Cholesterol", "225", "mg/dL", "125-200", "HIGH"),
        ("Creatinine", "1.1", "mg/dL", "0.6-1.2", "")
    ]
)

# Report C — Mixed data with qualifiers and unverified items
create_pdf(
    "qa_report_c.pdf",
    "Specialty & Immunology Panel with Qualifier",
    "2026-09-10",
    [
        ("C-Reactive Protein", "< 0.3", "mg/L", "0.0-3.0", ""),
        ("Hemoglobin", "12.8", "g/dL", "13.0-17.0", "LOW"),
        ("Vitamin D, 25-Hydroxy", "24", "ng/mL", "30-100", "LOW"),
        ("Glucose", "105", "mg/dL", "70-99", "HIGH")
    ]
)

# Synthetic PNG for OCR testing
img = Image.new("RGB", (800, 600), color=(255, 255, 255))
draw = ImageDraw.Draw(img)

draw.text((40, 30), "SYNTHETIC QA DATA — NOT A REAL MEDICAL RECORD", fill=(200, 0, 0))
draw.text((40, 60), "LABLENS SYNTHETIC IMAGE REPORT FOR OCR", fill=(0, 0, 0))
draw.text((40, 85), "Date: 2026-04-12", fill=(50, 50, 50))
draw.line([(40, 110), (760, 110)], fill=(0, 0, 0), width=2)

draw.text((40, 130), "Test Name", fill=(0, 0, 0))
draw.text((260, 130), "Result", fill=(0, 0, 0))
draw.text((360, 130), "Units", fill=(0, 0, 0))
draw.text((460, 130), "Reference Range", fill=(0, 0, 0))
draw.line([(40, 155), (760, 155)], fill=(120, 120, 120), width=1)

draw.text((40, 180), "Hemoglobin", fill=(0, 0, 0))
draw.text((260, 180), "13.8", fill=(0, 0, 0))
draw.text((360, 180), "g/dL", fill=(0, 0, 0))
draw.text((460, 180), "12.0 - 16.0", fill=(0, 0, 0))

draw.text((40, 220), "Fasting Glucose", fill=(0, 0, 0))
draw.text((260, 220), "98", fill=(0, 0, 0))
draw.text((360, 220), "mg/dL", fill=(0, 0, 0))
draw.text((460, 220), "70 - 99", fill=(0, 0, 0))

draw.text((40, 260), "Platelet Count", fill=(0, 0, 0))
draw.text((260, 260), "240", fill=(0, 0, 0))
draw.text((360, 260), "10^3/uL", fill=(0, 0, 0))
draw.text((460, 260), "150 - 450", fill=(0, 0, 0))

ocr_path = out_dir / "qa_ocr_report.png"
img.save(str(ocr_path))
print(f"Generated OCR PNG: {ocr_path}")

# Negative test files
(out_dir / "unsupported_format.xyz").write_text("This is an unsupported text file format.", encoding="utf-8")
(out_dir / "empty_report.pdf").write_bytes(b"")
(out_dir / "malformed_report.pdf").write_bytes(b"%PDF-1.4\n%Malformed binary corrupt data\x00\xff\xfe\xaa")

print("All synthetic test fixtures successfully created.")
