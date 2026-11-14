import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import '@fontsource/alef/hebrew-400.css'
import '@fontsource/alef/hebrew-700.css'
import '@fontsource/alef/400.css'
import '@fontsource/alef/700.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
