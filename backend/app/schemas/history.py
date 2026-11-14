from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class TimelineReportEntry(BaseModel):
    report_id: str
    filename: Optional[str] = None
    upload_date: Optional[str] = None
    report_date: Optional[str] = None
    effective_date: Optional[str] = None
    date_provenance: str
    extraction_status: str
    analysis_status: str
    analysis_freshness: str = "not_started"
    measurement_count: int
    critical_flags_count: int


class BiomarkerSummaryItem(BaseModel):
    test_name: str
    test_code: Optional[str] = None
    category: str
    observation_count: int


class HistoryOverviewResponse(BaseModel):
    total_reports: int
    reports_with_measurements: int
    timeline: List[TimelineReportEntry]
    available_biomarkers: List[BiomarkerSummaryItem]
    disclaimer: str


class BiomarkerObservation(BaseModel):
    measurement_id: str
    report_id: str
    filename: Optional[str] = None
    date: Optional[str] = None
    date_provenance: str
    test_name_original: str
    value_original: str
    value_numeric: Optional[float] = None
    unit: Optional[str] = None
    reference_range: Optional[str] = None
    reference_low: Optional[float] = None
    reference_high: Optional[float] = None
    lab_flag: Optional[str] = None
    derived_flag: Optional[str] = None
    verification_status: str
    trend_eligible: bool
    exclusion_reason: Optional[str] = None
    page_number: int


class BiomarkerTrendSummary(BaseModel):
    eligible_count: int
    needs_review_count: int
    recorded_difference: Optional[Dict[str, Any]] = None
    status_message: str


class BiomarkerHistoryResponse(BaseModel):
    test_name: str
    category: str
    total_observations: int
    observations: List[BiomarkerObservation]
    summary: BiomarkerTrendSummary
    disclaimer: str


class HistoryCompareRequest(BaseModel):
    report_ids: List[str]
