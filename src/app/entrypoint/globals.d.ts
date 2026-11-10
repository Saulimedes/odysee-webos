declare const APP_VERSION: string;
declare const APP_ID: string;
declare const APP_COMMIT: string;
declare const DEV_SERVER: boolean | undefined;

interface Window {
  webOS?: { platformBack?: () => void };
  __odyseeReady?: () => void;
  PalmServiceBridge?: new () => {
    onservicecallback: (message: string) => void;
    call: (uri: string, params: string) => void;
    cancel: () => void;
  };
}

interface HTMLVideoElement {
  mediaId?: string;
}

declare module '*.css';
