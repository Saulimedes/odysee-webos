import './app/styles/fonts.css';
import './app/styles/styles.css';
import { createRoot } from 'react-dom/client';
import App from './app/entrypoint/App';
import { bootSession } from './app/model/account';
import { retireServiceWorker } from './app/model/retireServiceWorker';
import { initAppearance } from './shared/config';

initAppearance();
bootSession();
retireServiceWorker();

createRoot(document.getElementById('app') as HTMLElement).render(<App />);
