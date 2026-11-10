import './app/styles/fonts.css';
import './app/styles/styles.css';
import { createRoot } from 'react-dom/client';
import App from './app/entrypoint/App';
import { bootSession } from './app/model/account';
import { retireServiceWorker } from './app/model/retireServiceWorker';
import { initAppearance } from './shared/config';
import { initLanguage, loadActiveLanguage } from './shared/i18n';

initAppearance();
initLanguage();
bootSession();
retireServiceWorker();

void loadActiveLanguage().then(() => createRoot(document.getElementById('app') as HTMLElement).render(<App />));
