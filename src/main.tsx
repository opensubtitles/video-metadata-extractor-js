import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import OptimizedApp from './components/OptimizedApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptimizedApp />
  </StrictMode>,
)