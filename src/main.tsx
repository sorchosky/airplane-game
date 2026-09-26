import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { installTestHook } from './debug/testHook'
import './styles/tokens.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

installTestHook()

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
