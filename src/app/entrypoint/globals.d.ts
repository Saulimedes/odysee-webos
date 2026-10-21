declare const APP_VERSION: string;
declare const APP_ID: string;

interface Window {
  webOS?: { platformBack?: () => void };
  __odyseeReady?: () => void;
}

declare module '*.css';
