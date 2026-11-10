import { useEffect, useRef, useState } from 'react';
import { IconLogin, IconMail, IconLock, IconWand } from '@tabler/icons-react';
import { KEY } from '@/shared/config';
import { useTranslation } from '@/shared/i18n';
import { PRIORITY, isTextField, useKeys, useNav } from '@/shared/lib';
import { Spinner } from '@/shared/ui';
import { checkLoginStatus, requestMagicLink, signIn, type User } from '@/entities/session';

type Method = 'magic' | 'password';
const POLL_MS = 3000;

export function LoginPage({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const t = useTranslation();
  const nav = useNav<unknown>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [method, setMethod] = useState<Method>('magic');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [field, setField] = useState(1);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const last = method === 'password' ? 3 : 2;

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(async () => {
      const user = await checkLoginStatus();
      if (user) onLoggedIn(user);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, onLoggedIn]);

  useEffect(() => {
    if (nav.sidebarFocused || waiting) return;
    if (field === 1) emailRef.current?.focus();
    else if (field === 2 && method === 'password') passwordRef.current?.focus();
  }, [field, method, nav.sidebarFocused, waiting]);

  const submit = async () => {
    if (!email) { setError(t('Please enter your email')); return; }
    if (method === 'password' && !password) { setError(t('Please enter your password')); return; }
    setBusy(true);
    setError(null);
    if (method === 'password') {
      const result = await signIn(email, password);
      if (result.success) onLoggedIn(result.user);
      else setError(result.error || t('Invalid email or password'));
    } else {
      const result = await requestMagicLink(email);
      if (result.success) setWaiting(true);
      else setError(result.error || t('Failed to send magic link'));
    }
    setBusy(false);
  };

  useKeys((event) => {
    if (busy) return true;
    if (waiting) {
      if (event.keyCode === KEY.ENTER) { setWaiting(false); return true; }
      return false;
    }
    const typing = isTextField(document.activeElement);
    const move = (next: number) => {
      if (typing) (document.activeElement as HTMLElement).blur();
      setField(Math.max(0, Math.min(last, next)));
    };
    switch (event.keyCode) {
      case KEY.UP: move(field - 1); return true;
      case KEY.DOWN: move(field + 1); return true;
      case KEY.LEFT:
        if (typing) { (document.activeElement as HTMLElement).blur(); nav.focusSidebar(); return true; }
        if (field === 0 && method === 'password') setMethod('magic');
        else nav.focusSidebar();
        return true;
      case KEY.RIGHT:
        if (typing) return false;
        if (field === 0) setMethod('password');
        return true;
      case KEY.ENTER:
        if (typing) return false;
        if (field === 1) emailRef.current?.focus();
        else if (field === 2 && method === 'password') passwordRef.current?.focus();
        else if (field === last) void submit();
        return true;
      default: return false;
    }
  }, { enabled: !nav.sidebarFocused, priority: PRIORITY.content });

  if (waiting) {
    return (
      <div className="page loginPage">
        <div className="panel">
          <IconWand size={96} className="panel__icon" />
          <h1>{t('Check Your Email')}</h1>
          <p>{t('We sent a magic link to')} <strong>{email}</strong></p>
          <p className="panel__hint">{t('Click the link in your email on your phone or computer. This page updates automatically when you are signed in.')}</p>
          <Spinner inline />
          <button className="button button--active" onClick={() => setWaiting(false)}>{t('Use a different method')}</button>
        </div>
      </div>
    );
  }

  const focus = (index: number) => (field === index && !nav.sidebarFocused ? ' field--active' : '');
  return (
    <div className="page loginPage">
      <div className="panel">
        <IconLogin size={96} className="panel__icon" />
        <h1>{t('Sign in to Odysee')}</h1>
        <p>{t('Sign in to access your subscriptions and watchlist')}</p>
        {error && <p className="panel__error">{error}</p>}
        <div className={`segmented${focus(0)}`}>
          <span className={method === 'magic' ? 'segmented__on' : ''} onClick={() => setMethod('magic')}>{t('Magic Link')}</span>
          <span className={method === 'password' ? 'segmented__on' : ''} onClick={() => setMethod('password')}>{t('Password')}</span>
        </div>
        <div className={`field${focus(1)}`}>
          <IconMail size={30} />
          <input ref={emailRef} type="email" placeholder={t('Email')} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} onFocus={() => setField(1)} />
        </div>
        {method === 'password' && (
          <div className={`field${focus(2)}`}>
            <IconLock size={30} />
            <input ref={passwordRef} type="password" placeholder={t('Password')} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} onFocus={() => setField(2)} />
          </div>
        )}
        <button className={`button${field === last && !nav.sidebarFocused ? ' button--active' : ''}`} disabled={busy} onClick={() => void submit()}>
          {busy ? <Spinner inline /> : method === 'password' ? t('Sign In') : t('Send Magic Link')}
        </button>
        <p className="panel__hint">{t('Do not have an account? Visit odysee.com to sign up')}</p>
      </div>
    </div>
  );
}
