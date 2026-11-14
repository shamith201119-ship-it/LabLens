"""
QA Test PDF Creator for LabLens
Generates synthetic lab report PDFs for end-to-end testing.
These are NOT real medical records.
"""
import pymupdf as fitz
import os

QA_DIR = os.path.dirname(os.path.abspath(__file__))
DISCLAIMER = "SYNTHETIC QA DATA — NOT A REAL MEDICAL RECORD"


def add_header(page, title, date, lab_name="QA Reference Laboratory"):
    page.insert_text((50, 40), lab_name, fontsize=14, fontname="helv", color=(0, 0, 0.6))
    page.insert_text((50, 60), DISCLAIMER, fontsize=9, fontname="helv", color=(0.8, 0, 0))
    page.insert_text((50, 80), title, fontsize=11, fontname="helv", color=(0, 0, 0))
    page.insert_text((50, 96), f"Sample Date: {date}", fontsize=9, fontname="helv", color=(0.3, 0.3, 0.3))
    page.insert_text((50, 110), "Patient: QA Test Patient | DOB: 01-Jan-1980 | MRN: QA-00001", fontsize=9, fontname="helv", color=(0.3, 0.3, 0.3))
    page.draw_line((50, 120), (560, 120), color=(0.5, 0.5, 0.5), width=0.5)


def add_table_header(page, y):
    headers = ["TEST NAME", "RESULT", "UNIT", "REFERENCE RANGE", "FLAG"]
    x_positions = [50, 220, 300, 370, 480]
    for i, h in enumerate(headers):
        page.insert_text((x_positions[i], y), h, fontsize=8, fontname="helv", color=(0.4, 0.4, 0.4))
    page.draw_line((50, y + 4), (560, y + 4), color=(0.6, 0.6, 0.6), width=0.3)
    return y + 16


def add_section(page, y, section_title):
    page.insert_text((50, y), section_title, fontsize=10, fontname="helv", color=(0.1, 0.1, 0.5))
    page.draw_line((50, y + 2), (560, y + 2), color=(0.7, 0.7, 0.9), width=0.3)
    return y + 14


def add_row(page, y, name, result, unit, ref_range, flag=""):
    color = (0.8, 0, 0) if flag in ("H", "L", "CRITICAL", "PANIC") else (0, 0, 0)
    page.insert_text((50, y), name, fontsize=9, fontname="helv", color=(0, 0, 0))
    page.insert_text((220, y), result, fontsize=9, fontname="helv", color=color)
    page.insert_text((300, y), unit, fontsize=9, fontname="helv", color=(0, 0, 0))
    page.insert_text((370, y), ref_range, fontsize=9, fontname="helv", color=(0, 0, 0))
    page.insert_text((480, y), flag, fontsize=9, fontname="helv", color=color)
    return y + 14


def create_report_a():
    """Earlier report with hemoglobin, glucose, WBC readings"""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    add_header(page, "COMPLETE BLOOD COUNT & METABOLIC PANEL", "15-Mar-2024")

    y = 140
    y = add_section(page, y, "COMPLETE BLOOD COUNT")
    y = add_table_header(page, y)
    y = add_row(page, y, "Hemoglobin", "11.2", "g/dL", "12.0 - 16.0", "L")
    y = add_row(page, y, "Red Blood Cell Count", "3.8", "x10^6/uL", "3.90 - 5.20", "L")
    y = add_row(page, y, "Hematocrit", "34.5", "%", "36.0 - 46.0", "L")
    y = add_row(page, y, "Mean Corpuscular Volume", "78.0", "fL", "80.0 - 100.0", "L")
    y = add_row(page, y, "Mean Corpuscular Hemoglobin", "26.0", "pg", "27.0 - 33.0", "L")
    y = add_row(page, y, "White Blood Cell Count", "11.5", "x10^3/uL", "4.0 - 10.0", "H")
    y = add_row(page, y, "Platelet Count", "185", "x10^3/uL", "150 - 400", "")
    y += 10

    y = add_section(page, y, "GLUCOSE & METABOLIC")
    y = add_table_header(page, y)
    y = add_row(page, y, "Glucose, Fasting", "118", "mg/dL", "70 - 99", "H")
    y = add_row(page, y, "HbA1c", "6.1", "%", "< 5.7", "H")
    y += 10

    y = add_section(page, y, "LIPID PROFILE")
    y = add_table_header(page, y)
    y = add_row(page, y, "Total Cholesterol", "198", "mg/dL", "< 200", "")
    y = add_row(page, y, "LDL Cholesterol", "128", "mg/dL", "< 100", "H")
    y = add_row(page, y, "HDL Cholesterol", "42", "mg/dL", "> 40", "")
    y = add_row(page, y, "Triglycerides", "145", "mg/dL", "< 150", "")

    page.insert_text((50, 750), DISCLAIMER, fontsize=7, fontname="helv", color=(0.6, 0.6, 0.6))
    out_path = os.path.join(QA_DIR, "qa_report_a.pdf")
    doc.save(out_path)
    doc.close()
    print(f"Created: {out_path}")
    return out_path


def create_report_b():
    """Later report with same biomarkers but different values"""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    add_header(page, "COMPLETE BLOOD COUNT & METABOLIC PANEL", "10-Sep-2024")

    y = 140
    y = add_section(page, y, "COMPLETE BLOOD COUNT")
    y = add_table_header(page, y)
    y = add_row(page, y, "Hemoglobin", "12.8", "g/dL", "12.0 - 16.0", "")
    y = add_row(page, y, "Red Blood Cell Count", "4.2", "x10^6/uL", "3.90 - 5.20", "")
    y = add_row(page, y, "Hematocrit", "38.2", "%", "36.0 - 46.0", "")
    y = add_row(page, y, "Mean Corpuscular Volume", "82.5", "fL", "80.0 - 100.0", "")
    y = add_row(page, y, "Mean Corpuscular Hemoglobin", "28.5", "pg", "27.0 - 33.0", "")
    y = add_row(page, y, "White Blood Cell Count", "7.2", "x10^3/uL", "4.0 - 10.0", "")
    y = add_row(page, y, "Platelet Count", "210", "x10^3/uL", "150 - 400", "")
    y += 10

    y = add_section(page, y, "GLUCOSE & METABOLIC")
    y = add_table_header(page, y)
    y = add_row(page, y, "Glucose, Fasting", "104", "mg/dL", "70 - 99", "H")
    y = add_row(page, y, "HbA1c", "5.9", "%", "< 5.7", "H")
    y += 10

    y = add_section(page, y, "LIPID PROFILE")
    y = add_table_header(page, y)
    y = add_row(page, y, "Total Cholesterol", "182", "mg/dL", "< 200", "")
    y = add_row(page, y, "LDL Cholesterol", "108", "mg/dL", "< 100", "H")
    y = add_row(page, y, "HDL Cholesterol", "48", "mg/dL", "> 40", "")
    y = add_row(page, y, "Triglycerides", "132", "mg/dL", "< 150", "")

    page.insert_text((50, 750), DISCLAIMER, fontsize=7, fontname="helv", color=(0.6, 0.6, 0.6))
    out_path = os.path.join(QA_DIR, "qa_report_b.pdf")
    doc.save(out_path)
    doc.close()
    print(f"Created: {out_path}")
    return out_path


def create_report_c():
    """Mixed data with qualifiers and unusual values"""
    doc = fitz.open()
    page = doc.new_page(width=612, height=792)
    add_header(page, "COMPREHENSIVE METABOLIC PANEL — MIXED UNITS", "05-Nov-2024")

    y = 140
    y = add_section(page, y, "KIDNEY FUNCTION")
    y = add_table_header(page, y)
    y = add_row(page, y, "Creatinine", "1.8", "mg/dL", "0.60 - 1.20", "H")
    y = add_row(page, y, "Blood Urea Nitrogen", "28", "mg/dL", "7 - 20", "H")
    y = add_row(page, y, "Estimated GFR", "55", "mL/min/1.73m2", "> 60", "L")
    y = add_row(page, y, "Uric Acid", "7.9", "mg/dL", "2.4 - 7.0", "H")
    y += 10

    y = add_section(page, y, "LIVER FUNCTION")
    y = add_table_header(page, y)
    y = add_row(page, y, "Alanine Aminotransferase", "52", "U/L", "7 - 40", "H")
    y = add_row(page, y, "Aspartate Aminotransferase", "38", "U/L", "10 - 40", "")
    y = add_row(page, y, "Alkaline Phosphatase", "145", "U/L", "44 - 147", "H")
    y = add_row(page, y, "Total Bilirubin", "1.1", "mg/dL", "0.2 - 1.2", "")
    y = add_row(page, y, "Albumin", "3.4", "g/dL", "3.5 - 5.0", "L")
    y += 10

    y = add_section(page, y, "ELECTROLYTES")
    y = add_table_header(page, y)
    y = add_row(page, y, "Sodium", "142", "mEq/L", "136 - 145", "")
    y = add_row(page, y, "Potassium", "5.6", "mEq/L", "3.5 - 5.1", "H")
    y = add_row(page, y, "Chloride", "102", "mEq/L", "98 - 106", "")
    y += 10

    y = add_section(page, y, "GLUCOSE (mixed units test)")
    y = add_table_header(page, y)
    y = add_row(page, y, "Glucose, Fasting", "< 60", "mg/dL", "70 - 99", "CRITICAL")
    y = add_row(page, y, "Glucose (mmol)", "5.2", "mmol/L", "3.9 - 5.5", "")  # ~93 mg/dL

    page.insert_text((50, 750), DISCLAIMER, fontsize=7, fontname="helv", color=(0.6, 0.6, 0.6))
    out_path = os.path.join(QA_DIR, "qa_report_c.pdf")
    doc.save(out_path)
    doc.close()
    print(f"Created: {out_path}")
    return out_path


if __name__ == "__main__":
    print("Creating QA test PDFs...")
    a = create_report_a()
    b = create_report_b()
    c = create_report_c()
    print(f"\nAll QA PDFs created:")
    for p in [a, b, c]:
        size = os.path.getsize(p)
        print(f"  {p} ({size} bytes)")
