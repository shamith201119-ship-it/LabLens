/**
 * Care Navigation, Provider Search & Clinician Summary constants and utilities
 */

export interface SpecialtyCategory {
  id: string
  label: string
  description: string
  keywords: string
}

export const SPECIALTY_CATEGORIES: SpecialtyCategory[] = [
  {
    id: 'general_physician',
    label: 'General Physician / Internal Medicine',
    description: 'Primary care doctor for general health assessment, fatigue, metabolic checkups, and initial lab reviews.',
    keywords: 'General Physician',
  },
  {
    id: 'family_medicine',
    label: 'Family Medicine',
    description: 'Comprehensive healthcare for individuals and families across all ages.',
    keywords: 'Family Medicine Doctor',
  },
  {
    id: 'endocrinologist',
    label: 'Endocrinologist',
    description: 'Hormone, diabetes, thyroid, and metabolic disorder specialist.',
    keywords: 'Endocrinologist',
  },
  {
    id: 'cardiologist',
    label: 'Cardiologist',
    description: 'Heart and cardiovascular system specialist for cholesterol, hypertension, and heart health.',
    keywords: 'Cardiologist',
  },
  {
    id: 'nephrologist',
    label: 'Nephrologist',
    description: 'Kidney specialist for eGFR, creatinine, proteinuria, and renal health.',
    keywords: 'Nephrologist',
  },
  {
    id: 'gastroenterologist',
    label: 'Gastroenterologist / Hepatologist',
    description: 'Digestive system and liver specialist for liver enzymes (ALT/AST), bilirubin, and GI concerns.',
    keywords: 'Gastroenterologist',
  },
  {
    id: 'hematologist',
    label: 'Hematologist',
    description: 'Blood specialist for complex anemia, platelets, white blood cells, and clotting evaluations.',
    keywords: 'Hematologist',
  },
  {
    id: 'dermatologist',
    label: 'Dermatologist',
    description: 'Skin, hair, and nails medical specialist.',
    keywords: 'Dermatologist',
  },
  {
    id: 'neurologist',
    label: 'Neurologist',
    description: 'Brain, spinal cord, and nervous system medical specialist.',
    keywords: 'Neurologist',
  },
]

export interface OfficialResource {
  id: string
  title: string
  provider: string
  url: string
  description: string
  guidance: string
}

export const OFFICIAL_CARE_RESOURCES: OfficialResource[] = [
  {
    id: 'nmr_search',
    title: 'National Medical Register (NMR) — Doctor Search',
    provider: 'National Medical Commission (NMC), India',
    url: 'https://nmr.nmc.org.in/search-doctor',
    description: 'Centralized government directory to search and check the registered qualifications and licensing of medical practitioners.',
    guidance: 'You can search by doctor name, state medical council, or registration number. Note that ongoing digitisation means some recent or legacy records may be updated separately by state councils.',
  },
  {
    id: 'nmc_smc',
    title: 'State Medical Councils Directory',
    provider: 'National Medical Commission (NMC)',
    url: 'https://nmc.org.in/page/information-desk-state-medical-councils',
    description: 'Links and contact information for State Medical Councils across India responsible for medical registration verification.',
    guidance: 'Consult the specific State Medical Council where the physician is licensed if a registration entry is not found on the national register.',
  },
  {
    id: 'esanjeevani',
    title: 'eSanjeevani — National Telemedicine Service',
    provider: 'Ministry of Health and Family Welfare, Govt. of India',
    url: 'https://esanjeevani.mohfw.gov.in/#/',
    description: 'Government of India national telemedicine platform offering free, online doctor consultations from home.',
    guidance: 'Connects citizens directly with qualified government doctors via digital consultation. Appointments and response times depend on hospital and doctor availability.',
  },
]

/**
 * Builds a privacy-preserving Google Maps search URL.
 * Only encodes user-selected category and user-entered locality.
 * Strictly NEVER includes patient names, report IDs, biomarkers, lab values, flags, or notes.
 */
export function buildMapsSearchUrl(specialtyKeywords: string, location: string): string {
  const queryParts = [specialtyKeywords.trim()]
  if (location.trim()) {
    queryParts.push('in ' + location.trim())
  }
  const fullQuery = queryParts.join(' ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`
}
