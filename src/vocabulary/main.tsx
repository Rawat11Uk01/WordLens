import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Vocabulary from './Vocabulary'
import '@/styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Vocabulary />
  </StrictMode>
)
