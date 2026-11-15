"""Focused tests for the Phase 9.10.3 adaptive OCR runtime.

GPU-specific tests are SIMULATED. The installed PaddlePaddle on this machine is
CPU-only, so no real GPU inference is executed in any test. Simulated GPU
results are labelled as simulated and must never be reported as real GPU
validation.
"""

import io
import json
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent
EVALUATOR_DIR = BACKEND_DIR / "tests"
for path in (str(BACKEND_DIR), str(EVALUATOR_DIR)):
    if path not in sys.path:
        sys.path.insert(0, path)

import app.services.ocr_engine as ocr_engine
import app.services.ocr_runtime as ocr_runtime
from app.database import get_connection
from app.services import extraction_service
from app.services.measurement_service import get_measurements, structure_report
from app.services.report_service import create_report, delete_report
from fastapi import UploadFile


# --------------------------------------------------------------------------
# Test doubles (simulated pipelines; NOT real inference)
# --------------------------------------------------------------------------

class StubEngine:
    """Simulated PaddleOCR pipeline used by mocked tests. SIMULATED."""

    def __init__(self, result):
        self.result = result
        self.ocr_calls = 0

    def ocr(self, path):
        self.ocr_calls += 1
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def ok_result(lines=("Hemoglobin 13.8 g/dL 12.0 - 16.0",)):
    lines = list(lines)
    return [
        {
            "rec_texts": lines,
            "rec_scores": [0.99] * len(lines),
            "rec_polys": [
                [[0, i * 30], [400, i * 30], [400, i * 30 + 24], [0, i * 30 + 24]]
                for i in range(len(lines))
            ],
        }
    ]


def fake_probe(compiled=True, devices=("gpu:0",), gpu_error=None, probe_error=None, vram_bytes=None):
    return {
        "compiled_with_cuda": compiled,
        "devices": list(devices),
        "gpu_error": gpu_error,
        "probe_error": probe_error,
        "vram_bytes": vram_bytes,
    }


def _reset_engine(monkeypatch):
    monkeypatch.setattr(ocr_engine, "_ocr_instance", None)
    monkeypatch.setattr(ocr_engine, "_current_selection", None)
    ocr_runtime.reset_runtime()


@pytest.fixture
def runtime_env(monkeypatch):
    for name in (
        "LABLENS_OCR_DEVICE",
        "LABLENS_OCR_CPU_THREADS",
        "LABLENS_OCR_RECOGNITION_BATCH_SIZE",
        "LABLENS_OCR_GPU_RECOGNITION_BATCH_SIZE",
    ):
        monkeypatch.delenv(name, raising=False)
    _reset_engine(monkeypatch)
    yield monkeypatch
    _reset_engine(monkeypatch)


def _stub_create_factory(behavior, record=None):
    """behavior: {'cpu': StubEngine-or-exception, 'gpu': ...}"""
    calls = record if record is not None else []

    def fake_create(device, selection):
        calls.append(device)
        outcome = behavior[device]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome

    return fake_create, calls


def make_png_upload() -> UploadFile:
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (480, 120), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((10, 40), "Hemoglobin 13.8 g/dL 12.0 - 16.0", fill="black")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return UploadFile(file=buf, filename="focused_ocr_runtime_test.png")


# --------------------------------------------------------------------------
# 1-3: selection in auto mode
# --------------------------------------------------------------------------

def test_cpu_only_paddle_auto_selects_cpu(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "auto")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe(compiled=False, devices=[]))

    selection = ocr_runtime.resolve_selection()
    assert selection["device"] == "cpu"
    assert selection["selected_reason"] == "paddle_not_compiled_with_cuda"
    assert selection["fallback_occurred"] is False


def test_cuda_runtime_with_gpu_selects_gpu(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "auto")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe(vram_bytes=12 * 1024**3))

    selection = ocr_runtime.resolve_selection()
    assert selection["device"] == "gpu"
    assert selection["selected_reason"] == "gpu_ready"
    assert selection["text_recognition_batch_size"] == 6  # >= 8 GiB VRAM tier
    assert selection["cpu_threads"] is None


def test_nvidia_card_alone_does_not_qualify_for_gpu(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "auto")
    # 12 GiB VRAM is discoverable, but the Paddle build is CPU-only.
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe(compiled=False, devices=[]))
    monkeypatch.setattr(ocr_runtime, "_nvidia_vram_bytes", lambda: 12 * 1024**3)

    selection = ocr_runtime.resolve_selection()
    assert selection["device"] == "cpu"
    assert selection["selected_reason"] == "paddle_not_compiled_with_cuda"


# --------------------------------------------------------------------------
# 4-9: initialization and inference fallback
# --------------------------------------------------------------------------

def test_gpu_init_failure_falls_back_to_cpu(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "auto")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe())

    fake_create, builds = _stub_create_factory(
        {"gpu": RuntimeError("simulated CUDA init failure at C:\\Users\\testuser\\secret\\pipeline.bin"),
         "cpu": StubEngine(ok_result())}
    )
    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)

    engine = ocr_engine.get_ocr()
    selection = ocr_engine.get_selection()

    assert builds == ["gpu", "cpu"]
    assert isinstance(engine, StubEngine)
    assert selection["device"] == "cpu"
    assert selection["fallback_occurred"] is True
    assert "simulated CUDA init failure" in (selection["fallback_reason"] or "")
    assert "C:\\" not in (selection["fallback_reason"] or "")
    assert "testuser" not in (selection["fallback_reason"] or "")
    assert "<path>" in (selection["fallback_reason"] or "")


def _gpu_failing_extract_setup(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "gpu")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe())

    gpu_engine = StubEngine(RuntimeError("simulated GPU kernel crash on page render"))
    cpu_engine = StubEngine(ok_result())
    fake_create, builds = _stub_create_factory({"gpu": gpu_engine, "cpu": cpu_engine})
    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)
    return gpu_engine, cpu_engine, builds


def test_gpu_inference_failure_retries_same_image_once_on_cpu(runtime_env, monkeypatch):
    gpu_engine, cpu_engine, _ = _gpu_failing_extract_setup(runtime_env, monkeypatch)

    items = ocr_engine.ocr_image("simulated-photo.png")

    assert gpu_engine.ocr_calls == 1
    assert cpu_engine.ocr_calls == 1
    assert items and items[0]["text"] == "Hemoglobin 13.8 g/dL 12.0 - 16.0"
    execution = ocr_runtime.get_last_execution()
    assert execution["device"] == "cpu"
    assert execution["fallback_occurred"] is True


def test_gpu_disabled_for_subsequent_calls_after_failure(runtime_env, monkeypatch):
    gpu_engine, cpu_engine, _ = _gpu_failing_extract_setup(runtime_env, monkeypatch)

    ocr_engine.ocr_image("simulated-page-1.png")
    ocr_engine.ocr_image("simulated-page-2.png")

    assert gpu_engine.ocr_calls == 1  # GPU not re-attempted
    assert cpu_engine.ocr_calls == 2
    assert ocr_runtime.gpu_disabled() is True
    assert ocr_runtime.get_last_execution()["device"] == "cpu"


def test_cpu_failure_propagates_normally(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "cpu")
    failing = StubEngine(RuntimeError("simulated CPU OCR failure"))

    def fake_create(device, selection):
        assert device == "cpu"  # explicit CPU mode: GPU is never constructed
        return failing

    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)

    with pytest.raises(RuntimeError, match="simulated CPU OCR failure"):
        ocr_engine.ocr_image("simulated-failure.png")


def test_explicit_cpu_mode_never_initializes_gpu(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "cpu")
    # Even with a CUDA-compatible-looking probe, CPU mode ignores it entirely.
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe(vram_bytes=12 * 1024**3))

    def fake_create(device, selection):
        return StubEngine(ok_result())

    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)

    engine = ocr_engine.get_ocr()
    selection = ocr_engine.get_selection()

    assert isinstance(engine, StubEngine)
    assert selection["mode"] == "cpu"
    assert selection["selected_reason"] == "explicit_cpu"
    assert selection["cpu_threads"] == ocr_runtime.adaptive_cpu_profile()["cpu_threads"]
    # explicit CPU must not probe the GPU runtime at all
    assert ocr_runtime.resolve_selection()["vram_bytes"] is None


def test_explicit_gpu_mode_falls_back_safely(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "gpu")
    fake_create, builds = _stub_create_factory(
        {"gpu": RuntimeError("simulated GPU init failure (no CUDA toolkit)"),
         "cpu": StubEngine(ok_result())}
    )
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "gpu")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe())
    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)

    engine = ocr_engine.get_ocr()
    selection = ocr_engine.get_selection()

    assert builds == ["gpu", "cpu"]
    assert isinstance(engine, StubEngine)
    assert selection["mode"] == "gpu"
    assert selection["device"] == "cpu"
    assert selection["fallback_occurred"] is True
    assert selection["fallback_reason"]


def test_explicit_gpu_mode_with_incompatible_runtime_stays_cpu(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "gpu")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe(compiled=False, devices=[]))

    def fake_create(device, selection):
        assert device == "cpu"  # no GPU pipeline is attempted
        return StubEngine(ok_result())

    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)

    engine = ocr_engine.get_ocr()
    selection = ocr_engine.get_selection()

    assert isinstance(engine, StubEngine)
    assert selection["device"] == "cpu"
    assert selection["selected_reason"] == "paddle_not_compiled_with_cuda"


# --------------------------------------------------------------------------
# 10-12: adaptive CPU configuration and caching
# --------------------------------------------------------------------------

def test_cpu_thread_count_never_exceeds_logical_cores(runtime_env, monkeypatch):
    cases = [(1, 1), (2, 2), (4, 4), (8, 4), (16, 4), (32, 4)]
    for logical, expected_max in cases:
        monkeypatch.setattr(ocr_runtime, "_logical_cores", lambda logical=logical: logical)
        monkeypatch.setattr(ocr_runtime, "_physical_cores", lambda logical=logical: max(1, logical // 2))
        monkeypatch.setattr(ocr_runtime, "_total_memory_bytes", lambda: 16 * 1024**3)
        profile = ocr_runtime.adaptive_cpu_profile()
        assert profile["cpu_threads"] <= logical
        assert profile["cpu_threads"] == expected_max


def test_cpu_thread_count_shrinks_on_very_low_memory(runtime_env, monkeypatch):
    monkeypatch.setattr(ocr_runtime, "_logical_cores", lambda: 4)
    monkeypatch.setattr(ocr_runtime, "_physical_cores", lambda: 2)
    monkeypatch.setattr(ocr_runtime, "_total_memory_bytes", lambda: 2 * 1024**3)

    profile = ocr_runtime.adaptive_cpu_profile()
    assert profile["cpu_threads"] == 2
    assert profile["text_recognition_batch_size"] == 1


def test_cpu_batch_size_follows_adaptive_profile(runtime_env, monkeypatch):
    def set_hw(logical, memory_gib):
        monkeypatch.setattr(ocr_runtime, "_logical_cores", lambda: logical)
        monkeypatch.setattr(ocr_runtime, "_physical_cores", lambda: max(1, logical // 2))
        monkeypatch.setattr(ocr_runtime, "_total_memory_bytes", lambda: int(memory_gib * 1024**3))

    set_hw(4, 8)
    assert ocr_runtime.adaptive_cpu_profile()["text_recognition_batch_size"] == 1
    set_hw(2, 4)
    assert ocr_runtime.adaptive_cpu_profile()["text_recognition_batch_size"] == 1
    set_hw(8, 16)
    assert ocr_runtime.adaptive_cpu_profile()["text_recognition_batch_size"] == 2
    # documented floor: batch never exceeds 6 even with overrides
    monkeypatch.setenv("LABLENS_OCR_RECOGNITION_BATCH_SIZE", "99")
    assert ocr_runtime.adaptive_cpu_profile()["text_recognition_batch_size"] == 6


def test_cached_pipeline_is_reused(runtime_env, monkeypatch):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "cpu")

    def fake_create(device, selection):
        return StubEngine(ok_result())

    builds = []
    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", lambda d, s: builds.append(d) or fake_create(d, s))

    first = ocr_engine.get_ocr()
    second = ocr_engine.get_ocr()
    assert first is second
    assert builds == ["cpu"]


def test_constructor_receives_adaptive_cpu_settings(runtime_env, monkeypatch):
    from unittest.mock import MagicMock

    captured = {}

    class FakeOCR:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    sys.modules["pypdfium2"] = MagicMock()
    monkeypatch.setattr("paddleocr.PaddleOCR", FakeOCR)
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "cpu")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe(compiled=False, devices=[]))

    ocr_engine.get_ocr()

    profile = ocr_runtime.adaptive_cpu_profile()
    assert captured["cpu_threads"] == profile["cpu_threads"]
    assert captured["cpu_threads"] <= ocr_runtime._logical_cores()
    assert captured["text_recognition_batch_size"] == profile["text_recognition_batch_size"]
    assert captured["text_det_limit_side_len"] == 1280
    assert captured["text_det_limit_type"] == "max"
    assert captured["enable_mkldnn"] is False
    assert captured["use_doc_orientation_classify"] is False
    assert captured["use_doc_unwarping"] is False
    assert captured["use_textline_orientation"] is False


# --------------------------------------------------------------------------
# 13-14: extraction metadata and persistence after fallback (simulated GPU)
# --------------------------------------------------------------------------

def _extract_report(runtime_env, monkeypatch, behavior):
    monkeypatch.setenv("LABLENS_OCR_DEVICE", "gpu")
    monkeypatch.setattr(ocr_runtime, "probe_paddle", lambda: fake_probe())

    fake_create, builds = _stub_create_factory(behavior)
    monkeypatch.setattr(ocr_engine, "_create_ocr_instance", fake_create)

    upload = make_png_upload()
    report = create_report(upload, consent=True, consent_timestamp=None)
    extraction = extraction_service.extract_report(report.id)
    structure_report(report.id)
    measurements = get_measurements(report.id)

    with get_connection() as conn:
        rows = conn.execute(
            "SELECT extraction_metadata FROM page_extractions WHERE report_id = ?",
            (report.id,),
        ).fetchall()
    metadata = [json.loads(row["extraction_metadata"]) for row in rows]
    return report, extraction, measurements, metadata


def test_metadata_records_actual_execution_device(runtime_env, monkeypatch):
    report, extraction, measurements, metadata = _extract_report(
        runtime_env,
        monkeypatch,
        {"gpu": StubEngine(ok_result()), "cpu": StubEngine(ok_result())},
    )
    try:
        assert extraction["status"] in ("completed", "review_required")
        page_meta = metadata[0]
        actual = page_meta.get("ocr_runtime")
        assert actual is not None
        assert actual["device"] == "gpu"
        assert actual["fallback_occurred"] is False
        assert actual["detection_limit_side_len"] == 1280
        assert actual["models"]["detection"] == "PP-OCRv6_medium_det"
        assert actual["models"]["recognition"] == "PP-OCRv6_medium_rec"
    finally:
        delete_report(report.id)


def test_metadata_records_cpu_fallback_after_simulated_gpu_failure(runtime_env, monkeypatch):
    report, extraction, measurements, metadata = _extract_report(
        runtime_env,
        monkeypatch,
        {
            "gpu": StubEngine(RuntimeError("simulated GPU kernel crash inside C:\\Users\\testuser\\lab\\raw.png")),
            "cpu": StubEngine(ok_result()),
        },
    )
    try:
        assert extraction["status"] in ("completed", "review_required")
        page_meta = metadata[0]
        actual = page_meta.get("ocr_runtime")
        assert actual is not None
        assert actual["device"] == "cpu"
        assert actual["fallback_occurred"] is True
        reason = actual.get("fallback_reason") or ""
        assert "simulated GPU kernel crash" in reason
        assert "C:\\" not in reason
        assert "testuser" not in reason
    finally:
        delete_report(report.id)


def test_fallback_produces_no_duplicate_pages_or_measurements(runtime_env, monkeypatch):
    baseline_report, _, baseline_measurements, baseline_meta = _extract_report(
        runtime_env,
        monkeypatch,
        {"gpu": StubEngine(ok_result()), "cpu": StubEngine(ok_result())},
    )
    fallback_report, _, fallback_measurements, fallback_meta = _extract_report(
        runtime_env,
        monkeypatch,
        {
            "gpu": StubEngine(RuntimeError("simulated GPU crash")),
            "cpu": StubEngine(ok_result()),
        },
    )
    try:
        assert len(fallback_meta) == 1
        assert len(baseline_meta) == 1
        # identical parsed measurements, zero duplicates introduced by retry
        assert len(fallback_measurements) == len(baseline_measurements)
        keys = [(m["test_name_normalized"], m["page_number"]) for m in fallback_measurements]
        assert len(keys) == len(set(keys))
        # one page, one extraction job row, one measurement set: rows were not
        # re-inserted by the retry path
        assert {m["page_number"] for m in fallback_measurements} <= {1}
    finally:
        delete_report(baseline_report.id)
        delete_report(fallback_report.id)
