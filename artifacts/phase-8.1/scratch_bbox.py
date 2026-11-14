from app.services.ocr_engine import ocr_image
items = ocr_image('backend/tests/fixtures/phase8_1_accuracy/cbc_report.png')
for it in items:
    print(it['text'], '-->', it['bbox'])
