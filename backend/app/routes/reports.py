from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse

from app.schemas.report import ReportListResponse, ReportResponse
from app.services.report_service import (
    create_report,
    delete_all,
    delete_report,
    download_report,
    get_report,
    list_reports,
)
from app.services.extraction_service import extract_report, get_extraction, get_page_image
from app.services.measurement_service import (
    MeasurementCorrectionError,
    VerificationSelectionError,
    correct_measurement,
    get_measurements,
    structure_report,
    verify_measurement,
    verify_selected_measurements,
)
from app.services.analysis_service import (
    analyse_report,
    compare_reports,
    get_analysis,
    get_analysis_history,
)
from app.services.explanation_service import get_explanations
from app.services.history_service import (
    get_history_overview,
    get_biomarker_history,
    compare_history_reports,
)
from app.schemas.explanations import ExplanationsResponse
from app.schemas.history import (
    HistoryOverviewResponse,
    BiomarkerHistoryResponse,
    HistoryCompareRequest,
)

router = APIRouter(prefix="/api")


@router.post("/reports/compare")
def compare_endpoint(payload: dict):
    ids = payload.get("report_ids", [])
    if not isinstance(ids, list) or len(ids) < 2:
        raise HTTPException(status_code=400, detail="Provide at least two report IDs.")
    try:
        return compare_reports(ids)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reports", response_model=ReportResponse, status_code=201)
def upload_report(
    file: UploadFile = File(...),
    consent: bool = Form(False),
    consent_timestamp: str | None = Form(None),
):
    return create_report(file, consent, consent_timestamp)


@router.get("/reports", response_model=ReportListResponse)
def get_reports():
    reports = list_reports()
    return ReportListResponse(reports=reports, total=len(reports))


@router.get("/reports/{report_id}", response_model=ReportResponse)
def get_report_endpoint(report_id: str):
    return get_report(report_id)


@router.get("/reports/{report_id}/download")
def download_report_endpoint(report_id: str):
    filename, media_type, path = download_report(report_id)
    return FileResponse(
        path=str(path),
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/reports/{report_id}/pages/{page_number}/image")
def report_page_image_endpoint(report_id: str, page_number: int):
    png = get_page_image(report_id, page_number)
    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/reports/{report_id}", status_code=204)
def delete_report_endpoint(report_id: str):
    delete_report(report_id)
    return None


@router.delete("/reports", status_code=200)
def delete_all_endpoint():
    count = delete_all()
    return {"deleted": count}


@router.post("/reports/{report_id}/extract")
def extract_endpoint(report_id: str):
    try:
        return extract_report(report_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Extraction failed.")


@router.get("/reports/{report_id}/extraction")
def get_extraction_endpoint(report_id: str):
    return get_extraction(report_id)


@router.post("/reports/{report_id}/structure")
def structure_endpoint(report_id: str):
    try:
        return structure_report(report_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Structuring failed.")


@router.get("/reports/{report_id}/measurements")
def list_measurements_endpoint(report_id: str):
    return {"measurements": get_measurements(report_id)}


@router.patch("/reports/{report_id}/measurements/{measurement_id}")
def patch_measurement_endpoint(report_id: str, measurement_id: str, payload: dict):
    try:
        return correct_measurement(measurement_id, payload)
    except MeasurementCorrectionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Update failed.")


@router.post("/reports/{report_id}/measurements/{measurement_id}/verify")
def verify_measurement_endpoint(report_id: str, measurement_id: str):
    try:
        return verify_measurement(measurement_id)
    except Exception:
        raise HTTPException(status_code=500, detail="Verify failed.")


@router.post("/reports/{report_id}/measurements/verify-selected")
def verify_selected_endpoint(report_id: str, payload: dict):
    try:
        return verify_selected_measurements(report_id, payload.get("measurement_ids"))
    except VerificationSelectionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Verify failed.")


@router.post("/reports/{report_id}/analyse")
def analyse_endpoint(report_id: str):
    try:
        return analyse_report(report_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Analysis failed.")


@router.get("/reports/{report_id}/analysis")
def get_analysis_endpoint(report_id: str):
    return get_analysis(report_id)


@router.get("/reports/{report_id}/analysis/history")
def get_analysis_history_endpoint(report_id: str):
    return get_analysis_history(report_id)


@router.get("/reports/{report_id}/explanations", response_model=ExplanationsResponse)
def get_explanations_endpoint(report_id: str):
    """
    Phase 5 — Patient-friendly explanation of a report's measurements and pattern findings.
    Returns the curated explanation catalogue matched against existing Phase 4 analysis.
    Analysis must be run before calling this endpoint; if not, analysis_status will be 'not_started'.
    Returns 404 if the report does not exist.
    """
    # Confirm the report exists first
    try:
        get_report(report_id)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=404, detail="Report not found.")
    try:
        return get_explanations(report_id)
    except FileNotFoundError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Explanation generation failed.")


# ---------------------------------------------------------------------------
# Phase 7 — Personal Lab History & Longitudinal Trends Endpoints
# ---------------------------------------------------------------------------

@router.get("/history", response_model=HistoryOverviewResponse)
def get_history_endpoint():
    """
    Phase 7 — Returns chronological timeline of all reports, measurement statistics,
    and distinct canonical biomarkers available across user history.
    """
    try:
        return get_history_overview()
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load lab history.")


@router.get("/history/biomarkers/{biomarker_name}", response_model=BiomarkerHistoryResponse)
def get_biomarker_history_endpoint(biomarker_name: str):
    """
    Phase 7 — Returns all chronological observations and trend calculations for a specific biomarker.
    """
    try:
        return get_biomarker_history(biomarker_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load biomarker history.")


@router.post("/history/compare")
def compare_history_endpoint(payload: HistoryCompareRequest):
    """
    Phase 7 — Dedicated history comparison route, reusing existing Phase 4 comparison engine.
    """
    try:
        return compare_history_reports(payload.report_ids)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Comparison failed.")
