import io
import json
import os
from PIL import Image, ImageDraw
import fitz

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def create_fixtures():
    # 1. Clean digital PDF (Table format)
    doc1 = fitz.open()
    page1 = doc1.new_page()
    page1.insert_text((50, 50), "METABOLIC PANEL LABORATORY REPORT", fontsize=14)
    page1.insert_text((50, 70), "Patient: Synthetic Jane Doe   Date: 2026-11-10", fontsize=10)
    page1.insert_text((50, 100), "Test Name                     Result    Units    Reference Interval    Flag", fontsize=10)
    page1.insert_text((50, 120), "Glucose, Fasting              112       mg/dL    70 - 99               H", fontsize=10)
    page1.insert_text((50, 140), "Hemoglobin A1c                6.2       %        4.0 - 5.6             High", fontsize=10)
    page1.insert_text((50, 160), "Creatinine, Serum             0.95      mg/dL    0.50 - 1.20           Normal", fontsize=10)
    page1.insert_text((50, 180), "Total Cholesterol             220       mg/dL    < 200                 H", fontsize=10)
    page1.insert_text((50, 200), "Triglycerides                 165       mg/dL    < 150                 High", fontsize=10)
    pdf1_path = os.path.join(BASE_DIR, "clean_digital_report.pdf")
    doc1.save(pdf1_path)
    doc1.close()

    gt1 = [
        {"test": "Glucose", "result": "112", "unit": "mg/dL", "range": "70 - 99", "flag": "H"},
        {"test": "HbA1c", "result": "6.2", "unit": "%", "range": "4.0 - 5.6", "flag": "High"},
        {"test": "Creatinine", "result": "0.95", "unit": "mg/dL", "range": "0.50 - 1.20", "flag": "Normal"},
        {"test": "Total Cholesterol", "result": "220", "unit": "mg/dL", "range": "< 200", "flag": "H"},
        {"test": "Triglycerides", "result": "165", "unit": "mg/dL", "range": "< 150", "flag": "High"},
    ]
    with open(os.path.join(BASE_DIR, "clean_digital_report.json"), "w") as f:
        json.dump(gt1, f, indent=2)

    # 2. PNG Laboratory Report (Image)
    img2 = Image.new("RGB", (900, 360), color="white")
    d2 = ImageDraw.Draw(img2)
    d2.text((40, 30), "COMPLETE BLOOD COUNT (CBC)", fill="black")
    d2.text((40, 70), "Hemoglobin                     14.2 g/dL       12.0 - 16.0", fill="black")
    d2.text((40, 110), "White Blood Cell Count        8.5 x10^3/uL    4.0 - 11.0", fill="black")
    d2.text((40, 150), "Platelet Count                 240 x10^3/uL    150 - 450", fill="black")
    d2.text((40, 190), "Red Blood Cell Count           4.65 mil/uL     4.20 - 5.40", fill="black")
    d2.text((40, 230), "Hematocrit                     42.0 %          37.0 - 48.0", fill="black")
    png2_path = os.path.join(BASE_DIR, "cbc_report.png")
    img2.save(png2_path, format="PNG")

    gt2 = [
        {"test": "Hemoglobin", "result": "14.2", "unit": "g/dL", "range": "12.0 - 16.0"},
        {"test": "White Blood Cell Count", "result": "8.5", "range": "4.0 - 11.0"},
        {"test": "Platelet Count", "result": "240", "range": "150 - 450"},
        {"test": "Red Blood Cell Count", "result": "4.65", "range": "4.20 - 5.40"},
        {"test": "Hematocrit", "result": "42.0", "unit": "%", "range": "37.0 - 48.0"},
    ]
    with open(os.path.join(BASE_DIR, "cbc_report.json"), "w") as f:
        json.dump(gt2, f, indent=2)

    # 3. Colon/KeyValue Format PDF
    doc3 = fitz.open()
    page3 = doc3.new_page()
    page3.insert_text((50, 50), "ENDOCRINOLOGY REPORT", fontsize=14)
    page3.insert_text((50, 90), "Fasting Glucose: 98 mg/dL (Reference: 70 - 99 mg/dL)", fontsize=11)
    page3.insert_text((50, 120), "Serum Potassium: 4.2 mmol/L (Reference: 3.5 - 5.1 mmol/L)", fontsize=11)
    page3.insert_text((50, 150), "Serum Sodium: 140 mmol/L (Reference: 136 - 145 mmol/L)", fontsize=11)
    page3.insert_text((50, 180), "TSH: 2.45 uIU/mL (Reference: 0.40 - 4.50 uIU/mL)", fontsize=11)
    pdf3_path = os.path.join(BASE_DIR, "keyvalue_report.pdf")
    doc3.save(pdf3_path)
    doc3.close()

    gt3 = [
        {"test": "Glucose", "result": "98", "unit": "mg/dL", "range": "70 - 99"},
        {"test": "Potassium", "result": "4.2", "unit": "mmol/L", "range": "3.5 - 5.1"},
        {"test": "Sodium", "result": "140", "unit": "mmol/L", "range": "136 - 145"},
        {"test": "TSH", "result": "2.45", "unit": "uIU/mL", "range": "0.40 - 4.50"},
    ]
    with open(os.path.join(BASE_DIR, "keyvalue_report.json"), "w") as f:
        json.dump(gt3, f, indent=2)

    # 4. Scanned PDF (Pure image inside PDF)
    doc4 = fitz.open()
    page4 = doc4.new_page(width=img2.width, height=img2.height)
    img_bytes = io.BytesIO()
    img2.save(img_bytes, format="PNG")
    page4.insert_image(page4.rect, stream=img_bytes.getvalue())
    pdf4_path = os.path.join(BASE_DIR, "scanned_cbc_report.pdf")
    doc4.save(pdf4_path)
    doc4.close()

    print("Created synthetic accuracy fixtures in:", BASE_DIR)

if __name__ == "__main__":
    create_fixtures()
