import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'antd/dist/reset.css';
/* P3-1：v2 设计令牌必须先于 global.css，保证 var(--wb-*) 在任何覆写之前就绪 */
import './theme/v2/tokens.css';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
