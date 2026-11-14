from typing import List, Optional
from pydantic import BaseModel


class SourceInfo(BaseModel):
    id: str
    title: str
    publisher: str
    url: str


class MeasurementExplanation(BaseModel):
    measurement_id: str
    test_name: str
    value: Optional[str]
    unit: Optional[str]
    reference_range: Optional[str]
    comparison_status: str
    lab_flag: Optional[str]
    is_critical: bool
    is_unverified: bool
    what_it_measures: str
    why_doctors_look_at_it: str
    result_description: str
    possible_influences: List[str]
    cannot_establish: str
    context_factors: List[str]
    discussion_questions: List[str]
    sources: List[SourceInfo]


class PatternExplanation(BaseModel):
    finding_id: str
    rule_id: str
    finding_code: str
    plain_title: str
    description: str
    plain_description: str
    why_grouped: str
    what_to_discuss: str
    recommendation_language: str
    patient_context_needed: List[str]
    missing_context: List[str]
    limitations: List[str]
    measurements: List[dict]
    sources: List[SourceInfo]
    has_catalogue_entry: bool


class ExplanationsSummary(BaseModel):
    total_assessments: int
    within_range: int
    above_range: int
    below_range: int
    unverified_or_needs_review: int
    supported_patterns: int
    critical_flags: int


class ExplanationsResponse(BaseModel):
    catalogue_version: str
    report_id: str
    analysis_status: str
    analysis_freshness: str = "current"
    summary: ExplanationsSummary
    measurements: List[MeasurementExplanation]
    patterns: List[PatternExplanation]
    disclaimer: str
