import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { AppReadinessProvider } from './context/AppReadinessContext'
import { MotionPreferenceProvider } from './context/MotionPreferenceProvider'
import { ToastProvider } from './context/ToastProvider'
import { GlobalLoader } from './components/loader/GlobalLoader'
import { StartupGuard } from './components/StartupGuard'
import './styles/tokens.css'
import './styles/global.css'
import './styles/components.css'
import './styles/landing.css'
import './styles/app.css'
import './styles/phase15.css'
import './styles/phase16.css'
import './styles/phase8.css'
import './styles/verification.css'
import './styles/loader.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('LabLens could not find the root element.')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppReadinessProvider>
      <MotionPreferenceProvider>
        <ToastProvider>
          <BrowserRouter>
            <StartupGuard>
              <GlobalLoader />
              <App />
            </StartupGuard>
          </BrowserRouter>
        </ToastProvider>
      </MotionPreferenceProvider>
    </AppReadinessProvider>
  </StrictMode>,
)
