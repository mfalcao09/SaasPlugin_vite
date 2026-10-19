import React from 'react';
import { createRoot } from 'react-dom/client';
import FornecedoresBeautyLandingPage from './pages/FornecedoresBeautyLandingPage';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FornecedoresBeautyLandingPage />
  </React.StrictMode>,
);
