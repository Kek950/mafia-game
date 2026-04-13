import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Handle SPA redirect from 404.html
const redirect = sessionStorage.redirect
if (redirect) {
  delete sessionStorage.redirect
  window.history.replaceState(null, '', new URL(redirect).pathname)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
