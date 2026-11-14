import { Component, type ReactNode } from 'react'

interface StartupGuardState {
  failed: boolean
}

/**
 * Last line of defence against a blank white screen at boot.
 * If anything throws while the app mounts (bad chunk, failed asset),
 * offer a clean reload instead of a silent dead page.
 */
export class StartupGuard extends Component<
  { children: ReactNode },
  StartupGuardState
> {
  state: StartupGuardState = { failed: false }

  static getDerivedStateFromError(): StartupGuardState {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('LabLens failed to start:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="startup-guard" role="alert">
        <div className="startup-guard__card">
          <p className="startup-guard__eyebrow">LabLens could not start</p>
          <h1 className="startup-guard__title">Something went wrong loading LabLens.</h1>
          <p className="startup-guard__body">
            This is usually a dropped connection while assets were being downloaded.
            Reloading fixes it in almost every case.
          </p>
          <button
            className="startup-guard__button"
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload LabLens
          </button>
        </div>
      </div>
    )
  }
}
