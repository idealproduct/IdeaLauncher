import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// import App from './App'
import Router from './router';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* <App /> */}
    <Router />
  </StrictMode>,
);
