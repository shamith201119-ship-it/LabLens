"""Focused tests for the production OCR detector configuration."""

import sys
from unittest.mock import MagicMock

import pytest

import app.services.ocr_engine as ocr_engine


def test_production_ocr_constructor_receives_verified_limits(monkeypatch):
    """The singleton constructor must receive the validated detector limits."""
    captured = {}

    class FakeOCR:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    # Mirror get_ocr()'s guard so importing paddleocr cannot load pypdfium2.
    sys.modules["pypdfium2"] = MagicMock()
    monkeypatch.setattr("paddleocr.PaddleOCR", FakeOCR)

    original_instance = ocr_engine._ocr_instance
    ocr_engine._ocr_instance = None
    try:
        instance = ocr_engine.get_ocr()
    finally:
        ocr_engine._ocr_instance = original_instance

    assert isinstance(instance, FakeOCR)
    assert captured["text_det_limit_side_len"] == 1280
    assert captured["text_det_limit_type"] == "max"
    assert captured["lang"] == "en"
    assert captured["enable_mkldnn"] is False
    assert captured["use_doc_orientation_classify"] is False
    assert captured["use_doc_unwarping"] is False
    assert captured["use_textline_orientation"] is False


def test_cached_ocr_instance_reuses_verified_live_configuration():
    """The cached production instance must expose the validated detector config."""
    ocr = ocr_engine.get_ocr()
    assert ocr_engine.get_ocr() is ocr

    assert ocr._params["text_det_limit_side_len"] == 1280
    assert ocr._params["text_det_limit_type"] == "max"
    assert ocr._params["use_doc_orientation_classify"] is False
    assert ocr._params["use_doc_unwarping"] is False
    assert ocr._params["use_textline_orientation"] is False

    pipeline = ocr.paddlex_pipeline
    assert pipeline.use_doc_preprocessor is False
    assert pipeline.use_textline_orientation is False
    assert pipeline.text_det_limit_side_len == 1280
    assert pipeline.text_det_limit_type == "max"
    assert pipeline.text_det_max_side_limit == 4000
    assert pipeline.text_det_model.model_name == "PP-OCRv6_medium_det"
    assert pipeline.text_rec_model.model_name == "PP-OCRv6_medium_rec"

    resize = pipeline.text_det_model.pre_tfs["Resize"]
    assert resize.limit_side_len == 1280
    assert resize.limit_type == "max"
    assert resize.max_side_limit == 4000
