import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Stack, Text, Button, Center, Paper, Loader, SegmentedControl, TextInput, PasswordInput } from '@mantine/core';
import { useWindowEvent } from '@mantine/hooks';
import { IconLogin, IconMail, IconLock, IconWand } from '@tabler/icons-react';
import { login, requestMagicLink, checkLoginStatus } from '../api/odysee';
import { KEYCODE_UP, KEYCODE_DOWN, KEYCODE_ENTER, KEYCODE_LEFT, KEYCODE_RIGHT } from '../constants';

export default function Login({ onFocusSidebar, sidebarFocused, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState('magic'); // 'magic' or 'password'
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [focusedField, setFocusedField] = useState(1); // Start on email field: 0=method, 1=email, 2=password/button, 3=button (password only)
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const pollInterval = useRef(null);

  // Mantine input styles - remove all borders, scale up
  const inputStyles = useMemo(() => ({
    root: {
      flex: 1,
    },
    wrapper: {
      backgroundColor: 'transparent',
    },
    input: {
      fontSize: '2.1rem',
      padding: '20px 22px',
      height: 'auto',
      minHeight: '70px',
      backgroundColor: 'transparent',
      color: '#fff',
      border: 'none !important',
      borderLeft: 'none !important',
      borderRadius: 0,
      '&:focus': {
        border: 'none !important',
        outline: 'none'
      },
      '&::placeholder': {
        color: '#888'
      }
    }
  }), []);

  // Poll for login status after magic link sent
  useEffect(() => {
    if (magicLinkSent) {
      pollInterval.current = setInterval(async () => {
        const user = await checkLoginStatus();
        if (user) {
          clearInterval(pollInterval.current);
          onLoginSuccess(user);
        }
      }, 3000); // Check every 3 seconds
    }

    return () => {
      if (pollInterval.current) {
        clearInterval(pollInterval.current);
      }
    };
  }, [magicLinkSent, onLoginSuccess]);

  // Max field index depends on login method
  const maxFieldIndex = loginMethod === 'password' ? 3 : 2;

  // Handle keyboard navigation
  useWindowEvent('keydown', (event) => {
    if (sidebarFocused || loading || magicLinkSent) return;

    const key = event.key;
    // Check if any input element is focused (handles Mantine wrapper)
    const isInputFocused = document.activeElement?.tagName === 'INPUT';

    // When input is focused, only handle navigation keys - let everything else pass to webOS
    if (isInputFocused) {
      if (key === 'ArrowUp') {
        event.preventDefault();
        document.activeElement.blur();
        setFocusedField(prev => Math.max(0, prev - 1));
      } else if (key === 'ArrowDown') {
        event.preventDefault();
        document.activeElement.blur();
        setFocusedField(prev => Math.min(maxFieldIndex, prev + 1));
      } else if (key === 'ArrowLeft') {
        document.activeElement.blur();
        onFocusSidebar();
      }
      // Let ALL other keys (including Enter) pass through to webOS for keyboard
      return;
    }

    if (key === 'ArrowUp') {
      event.preventDefault();
      setFocusedField(prev => Math.max(0, prev - 1));
    } else if (key === 'ArrowDown') {
      event.preventDefault();
      setFocusedField(prev => Math.min(maxFieldIndex, prev + 1));
    } else if (key === 'ArrowLeft') {
      event.preventDefault();
      if (focusedField === 0) {
        if (loginMethod === 'password') {
          setLoginMethod('magic');
        } else {
          onFocusSidebar();
        }
      } else {
        onFocusSidebar();
      }
    } else if (key === 'ArrowRight') {
      event.preventDefault();
      if (focusedField === 0) {
        setLoginMethod('password');
      }
    } else if (key === 'Enter') {
      if (focusedField === 1 || (focusedField === 2 && loginMethod === 'password')) {
        // Focus the input to show keyboard
        const ref = focusedField === 1 ? emailRef : passwordRef;
        ref.current?.focus();
      } else if (focusedField === maxFieldIndex) {
        event.preventDefault();
        handleLogin();
      }
    }
  });

  // Focus email input on mount
  useEffect(() => {
    if (emailRef.current) {
      emailRef.current.focus();
    }
  }, []);

  // Focus the correct field when navigating
  useEffect(() => {
    if (sidebarFocused) return;

    if (focusedField === 1 && emailRef.current) {
      emailRef.current.focus();
    } else if (focusedField === 2 && loginMethod === 'password' && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [focusedField, sidebarFocused, loginMethod]);

  const handleLogin = async () => {
    console.log('handleLogin called, loginMethod:', loginMethod, 'email:', email, 'hasPassword:', !!password);

    if (!email) {
      setError('Please enter your email');
      return;
    }

    if (loginMethod === 'password' && !password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (loginMethod === 'password') {
        // Password login
        console.log('Attempting password login...');
        const result = await login(email, password);
        console.log('Login result:', result);

        if (result.success) {
          onLoginSuccess(result.user);
        } else {
          setError(result.error || 'Invalid email or password');
        }
      } else {
        // Magic link login
        console.log('Attempting magic link login...');
        const result = await requestMagicLink(email);
        console.log('Magic link result:', result);

        if (result.success) {
          setMagicLinkSent(true);
        } else {
          setError(result.error || 'Failed to send magic link');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Magic link waiting screen
  if (magicLinkSent) {
    return (
      <div className="login-container">
        <Center style={{ height: '100vh' }}>
          <Paper
            p={48}
            radius="md"
            className="login-paper"
            style={{
              backgroundColor: 'rgba(30, 30, 30, 0.95)',
              minWidth: 600,
            }}
          >
            <Stack spacing="xl" align="center">
              <IconWand size={96} color="#de0050" />

              <Text size={32} weight={700} color="white">
                Check Your Email
              </Text>

              <Text size="xl" color="dimmed" align="center">
                We sent a magic link to <Text component="span" color="white" weight={500}>{email}</Text>
              </Text>

              <Text size="lg" color="dimmed" align="center">
                Click the link in your email on your phone or computer.
                This page will automatically update when you're signed in.
              </Text>

              <Loader color="pink" size="lg" mt="md" />

              <Text size="md" color="dimmed" mt="lg">
                Waiting for confirmation...
              </Text>

              <Button
                variant="subtle"
                color="gray"
                size="lg"
                onClick={() => {
                  setMagicLinkSent(false);
                  if (pollInterval.current) {
                    clearInterval(pollInterval.current);
                  }
                }}
              >
                Use a different method
              </Button>
            </Stack>
          </Paper>
        </Center>
      </div>
    );
  }

  return (
    <div className="login-container">
      <Center style={{ minHeight: '100vh', alignItems: 'flex-start', paddingTop: '8vh' }}>
        <Paper
          p={48}
          radius="md"
          className="login-paper"
          style={{
            backgroundColor: 'rgba(30, 30, 30, 0.95)',
            minWidth: 600,
          }}
        >
          <Stack spacing="xl" align="center">
            <IconLogin size={96} color="#de0050" />

            <Text size={32} weight={700} color="white">
              Sign in to Odysee
            </Text>

            <Text size="xl" color="dimmed" align="center">
              Sign in to access your subscriptions and watchlist
            </Text>

            {error && (
              <Text color="red" size="lg" align="center">
                {error}
              </Text>
            )}

            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} style={{ width: '100%', margin: 0 }}>
              <Stack spacing="lg" style={{ width: '100%' }} mt="md">
                {/* Login method selector */}
                <SegmentedControl
                  value={loginMethod}
                  onChange={(value) => {
                    setLoginMethod(value);
                    setError(null);
                  }}
                  data={[
                    { label: 'Magic Link', value: 'magic' },
                    { label: 'Password', value: 'password' },
                  ]}
                  color="pink"
                  size="lg"
                  fullWidth
                  className={focusedField === 0 ? 'login-input--focused' : ''}
                  disabled={loading}
                />

                <div className={`login-input-wrapper ${focusedField === 1 ? 'login-input--focused' : ''}`}>
                  <IconMail size={24} color="#888" style={{ marginLeft: 18, flexShrink: 0 }} />
                  <TextInput
                    ref={emailRef}
                    type="email"
                    size="lg"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={() => setFocusedField(1)}
                    disabled={loading}
                    styles={inputStyles}
                  />
                </div>

                {loginMethod === 'password' && (
                  <div className={`login-input-wrapper ${focusedField === 2 ? 'login-input--focused' : ''}`}>
                    <IconLock size={24} color="#888" style={{ marginLeft: 18, flexShrink: 0 }} />
                    <TextInput
                      ref={passwordRef}
                      type="password"
                      size="lg"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField(2)}
                      disabled={loading}
                      styles={inputStyles}
                    />
                  </div>
                )}

                <Button
                  size="xl"
                  color="pink"
                  type="submit"
                  disabled={loading}
                  className={focusedField === maxFieldIndex ? 'login-button--focused' : ''}
                  fullWidth
                  mt="sm"
                  leftIcon={loginMethod === 'magic' ? <IconWand size={28} /> : null}
                  styles={{ label: { fontSize: '1.5rem' } }}
                >
                  {loading ? (
                    <Loader size="md" color="white" />
                  ) : loginMethod === 'password' ? (
                    'Sign In'
                  ) : (
                    'Send Magic Link'
                  )}
                </Button>
              </Stack>
            </form>

            <Text size="lg" color="dimmed" mt="lg" align="center">
              Don't have an account? Visit odysee.com to sign up
            </Text>
          </Stack>
        </Paper>
      </Center>
    </div>
  );
}
