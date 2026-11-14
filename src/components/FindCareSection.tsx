import { useState } from 'react'
import {
  ExternalLink,
  MapPin,
  Search,
  ShieldCheck,
  Stethoscope,
  Video,
  Info,
} from 'lucide-react'
import {
  SPECIALTY_CATEGORIES,
  OFFICIAL_CARE_RESOURCES,
  buildMapsSearchUrl,
} from '../lib/careNavigation'
import { Button } from './Button'

export function FindCareSection() {
  const [selectedSpecialty, setSelectedSpecialty] = useState(SPECIALTY_CATEGORIES[0].id)
  const [customSpecialty, setCustomSpecialty] = useState('')
  const [location, setLocation] = useState('')
  const [includeType, setIncludeType] = useState<'all' | 'clinic' | 'hospital'>('all')

  const activeCategory = SPECIALTY_CATEGORIES.find((s) => s.id === selectedSpecialty)
  const effectiveKeywords =
    selectedSpecialty === 'custom'
      ? customSpecialty || 'Doctor'
      : activeCategory
        ? activeCategory.keywords +
          (includeType === 'clinic' ? ' Clinic' : includeType === 'hospital' ? ' Hospital' : '')
        : 'Doctor'

  const mapsUrl = buildMapsSearchUrl(effectiveKeywords, location)
  const queryDisplay = effectiveKeywords + (location.trim() ? ` in ${location.trim()}` : '')

  const handleOpenSearch = () => {
    window.open(mapsUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="care-section" aria-labelledby="care-discovery-title">
      <div className="care-section__head">
        <div className="care-section__title-group">
          <Stethoscope size={20} className="care-section__icon" aria-hidden="true" />
          <h2 id="care-discovery-title" className="care-section__title">
            Find care & official resources
          </h2>
        </div>
        <p className="care-section__sub">
          Explore nearby doctors, clinics, and official registration registries to prepare for your conversation with a qualified professional.
        </p>
      </div>

      {/* Discovery Search Card */}
      <div className="care-card care-search-card">
        <h3 className="care-card__title">
          <Search size={16} aria-hidden="true" />
          Search nearby healthcare providers
        </h3>
        <p className="care-card__desc">
          Select a specialty and specify your city or neighbourhood. The query opens securely on Google Maps without sharing any report or health data.
        </p>

        <div className="care-form">
          <div className="care-form__group">
            <label htmlFor="care-specialty" className="care-form__label">
              Medical specialty / Provider type
            </label>
            <select
              id="care-specialty"
              className="care-form__select"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              {SPECIALTY_CATEGORIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="custom">Other / Custom search term...</option>
            </select>
          </div>

          {selectedSpecialty === 'custom' && (
            <div className="care-form__group">
              <label htmlFor="care-custom-specialty" className="care-form__label">
                Enter specialty or clinic type
              </label>
              <input
                id="care-custom-specialty"
                type="text"
                className="care-form__input"
                placeholder="e.g. Pulmonologist, Diagnostic Center..."
                value={customSpecialty}
                onChange={(e) => setCustomSpecialty(e.target.value)}
              />
            </div>
          )}

          <div className="care-form__group">
            <label htmlFor="care-location" className="care-form__label">
              Location (City, Area, or PIN code)
            </label>
            <div className="care-input-wrap">
              <MapPin size={15} className="care-input-icon" aria-hidden="true" />
              <input
                id="care-location"
                type="text"
                className="care-form__input care-form__input--icon"
                placeholder="e.g. Bengaluru, Indiranagar, 560038"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          <div className="care-form__group">
            <span className="care-form__label">Facility preference</span>
            <div className="care-chips">
              <button
                type="button"
                className={`care-chip ${includeType === 'all' ? 'is-active' : ''}`}
                onClick={() => setIncludeType('all')}
              >
                All providers
              </button>
              <button
                type="button"
                className={`care-chip ${includeType === 'clinic' ? 'is-active' : ''}`}
                onClick={() => setIncludeType('clinic')}
              >
                Clinics
              </button>
              <button
                type="button"
                className={`care-chip ${includeType === 'hospital' ? 'is-active' : ''}`}
                onClick={() => setIncludeType('hospital')}
              >
                Hospitals
              </button>
            </div>
          </div>

          {/* Privacy Preview Callout */}
          <div className="care-privacy-notice">
            <Info size={14} className="care-privacy-notice__icon" aria-hidden="true" />
            <div>
              <strong>Privacy guarantee:</strong> External search query:{' '}
              <code className="care-query-preview">"{queryDisplay}"</code>. No report data, biomarker values, or patient information is ever included.
            </div>
          </div>

          <div className="care-form__actions">
            <Button
              variant="primary"
              size="md"
              onClick={handleOpenSearch}
              className="care-search-btn"
            >
              <Search size={15} aria-hidden="true" />
              Search on Google Maps
              <ExternalLink size={13} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {/* Official Doctor Registration & Verification */}
      <div className="care-card">
        <h3 className="care-card__title">
          <ShieldCheck size={16} aria-hidden="true" />
          Check a doctor's official registration
        </h3>
        <p className="care-card__desc">
          In India, registered medical practitioners are listed with the National Medical Commission (NMC) and respective State Medical Councils. Use official registries to confirm a physician's license number and qualifications.
        </p>

        <div className="care-resource-list">
          {OFFICIAL_CARE_RESOURCES.slice(0, 2).map((res) => (
            <article key={res.id} className="care-resource-item">
              <div className="care-resource-item__content">
                <span className="care-resource-item__badge">{res.provider}</span>
                <h4 className="care-resource-item__title">{res.title}</h4>
                <p className="care-resource-item__desc">{res.description}</p>
                <p className="care-resource-item__guidance">
                  <strong>How to check:</strong> {res.guidance}
                </p>
              </div>
              <a
                href={res.url}
                target="_blank"
                rel="noopener noreferrer"
                className="care-resource-link"
              >
                <span>Visit registry</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>

        <div className="care-disclaimer-box">
          <Info size={13} aria-hidden="true" />
          <span>
            <strong>Verification notice:</strong> LabLens does not independently verify, endorse, or rate healthcare providers. Always verify credentials with the relevant State Medical Council or healthcare facility.
          </span>
        </div>
      </div>

      {/* Government Teleconsultation (eSanjeevani) */}
      <div className="care-card">
        <h3 className="care-card__title">
          <Video size={16} aria-hidden="true" />
          Consult online via national telemedicine (eSanjeevani)
        </h3>
        <p className="care-card__desc">
          Access free, government-operated virtual medical consultations with registered physicians from your home.
        </p>

        <article className="care-resource-item care-resource-item--tele">
          <div className="care-resource-item__content">
            <span className="care-resource-item__badge">
              Ministry of Health & Family Welfare, Govt. of India
            </span>
            <h4 className="care-resource-item__title">eSanjeevani National Telemedicine Service</h4>
            <p className="care-resource-item__desc">
              Direct digital outpatient consults (OPD) connecting citizens with doctors across government health wellness centres and hospitals.
            </p>
            <p className="care-resource-item__guidance">
              <strong>Availability:</strong> Consultations operate through the official portal. Response times depend on doctor schedules and queue volumes.
            </p>
          </div>
          <a
            href="https://esanjeevani.mohfw.gov.in/#/"
            target="_blank"
            rel="noopener noreferrer"
            className="care-resource-link care-resource-link--primary"
          >
            <span>Open eSanjeevani</span>
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </article>
      </div>
    </section>
  )
}
