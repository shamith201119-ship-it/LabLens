# Curated test-name alias dictionary.
# Keys are normalized (lowercase, stripped). Values: (normalized_name, test_code).

TEST_ALIASES: dict[str, tuple[str, str | None]] = {
    # CBC
    "hemoglobin": ("Hemoglobin", "HGB"),
    "haemoglobin": ("Hemoglobin", "HGB"),
    "hb": ("Hemoglobin", "HGB"),
    "hgb": ("Hemoglobin", "HGB"),
    "rbc": ("Red Blood Cell Count", "RBC"),
    "red blood cell count": ("Red Blood Cell Count", "RBC"),
    "wbc": ("White Blood Cell Count", "WBC"),
    "white blood cell count": ("White Blood Cell Count", "WBC"),
    "platelet count": ("Platelet Count", "PLT"),
    "plateletcount": ("Platelet Count", "PLT"),
    "platelets": ("Platelet Count", "PLT"),
    "hematocrit": ("Hematocrit", "HCT"),
    "haematocrit": ("Hematocrit", "HCT"),
    "hct": ("Hematocrit", "HCT"),
    "mcv": ("Mean Corpuscular Volume", "MCV"),
    "mch": ("Mean Corpuscular Hemoglobin", "MCH"),
    "mchc": ("Mean Corpuscular Hemoglobin Concentration", "MCHC"),
    "rdw": ("Red Cell Distribution Width", "RDW"),
    "red cell distribution width": ("Red Cell Distribution Width", "RDW"),
    # Lipid
    "total cholesterol": ("Total Cholesterol", "TC"),
    "cholesterol, total": ("Total Cholesterol", "TC"),
    "tc": ("Total Cholesterol", "TC"),
    "hdl cholesterol": ("HDL Cholesterol", "HDL"),
    "hdl-c": ("HDL Cholesterol", "HDL"),
    "ldl cholesterol": ("LDL Cholesterol", "LDL"),
    "ldl-c": ("LDL Cholesterol", "LDL"),
    "triglycerides": ("Triglycerides", "TG"),
    "tg": ("Triglycerides", "TG"),
    "vldl": ("VLDL Cholesterol", "VLDL"),
    # Glucose
    "glucose": ("Glucose", "GLU"),
    "blood glucose": ("Glucose", "GLU"),
    "fasting glucose": ("Glucose", "GLU"),
    "glucose, fasting": ("Glucose", "GLU"),
    "fasting blood sugar": ("Glucose", "GLU"),
    "fbs": ("Glucose", "GLU"),
    "hba1c": ("HbA1c", "HBA1C"),
    "hemoglobin a1c": ("HbA1c", "HBA1C"),
    "glycated hemoglobin": ("HbA1c", "HBA1C"),
    "glycosylated haemoglobin": ("HbA1c", "HBA1C"),
    "hba1c (ngsp)": ("HbA1c", "HBA1C"),
    # Liver
    "alt": ("Alanine Aminotransferase", "ALT"),
    "alanine aminotransferase": ("Alanine Aminotransferase", "ALT"),
    "ast": ("Aspartate Aminotransferase", "AST"),
    "aspartate aminotransferase": ("Aspartate Aminotransferase", "AST"),
    "alp": ("Alkaline Phosphatase", "ALP"),
    "alkaline phosphatase": ("Alkaline Phosphatase", "ALP"),
    "bilirubin total": ("Total Bilirubin", "TBIL"),
    "total bilirubin": ("Total Bilirubin", "TBIL"),
    "albumin": ("Albumin", "ALB"),
    # Kidney
    "creatinine": ("Creatinine", "CREAT"),
    "serum creatinine": ("Creatinine", "CREAT"),
    "creatinine, serum": ("Creatinine", "CREAT"),
    "urea": ("Urea", "UREA"),
    "blood urea nitrogen": ("Blood Urea Nitrogen", "BUN"),
    "bun": ("Blood Urea Nitrogen", "BUN"),
    "egfr": ("Estimated GFR", "EGFR"),
    "estimated gfr": ("Estimated GFR", "EGFR"),
    "e-gfr": ("Estimated GFR", "EGFR"),
    "gfr": ("Estimated GFR", "EGFR"),
    "uric acid": ("Uric Acid", "UA"),
    "sodium": ("Sodium", "NA"),
    "potassium": ("Potassium", "K"),
    "chloride": ("Chloride", "CL"),
    # Vitamins & Hormones
    "vitamin d": ("Vitamin D (25-OH)", "VITD"),
    "vitamin d (25-oh)": ("Vitamin D (25-OH)", "VITD"),
    "25-hydroxy vitamin d": ("Vitamin D (25-OH)", "VITD"),
    "vitamin b12": ("Vitamin B12", "B12"),
    "b12": ("Vitamin B12", "B12"),
    "tsh": ("Thyroid Stimulating Hormone", "TSH"),
    "thyroid stimulating hormone": ("Thyroid Stimulating Hormone", "TSH"),
}


def normalize_name(raw: str) -> tuple[str, str | None, float]:
    key = " ".join(raw.lower().split())
    # strip common punctuation
    key = key.strip(" .:-")
    if key in TEST_ALIASES:
        name, code = TEST_ALIASES[key]
        return name, code, 0.95
    # try contains
    for alias, (name, code) in TEST_ALIASES.items():
        if alias in key or key in alias:
            return name, code, 0.7
    return raw.strip(), None, 0.4
