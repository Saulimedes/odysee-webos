import { LBRY_API_URL, ODYSEE_PROXY_URL } from '@/shared/config';
import { REQUEST_TIMEOUT_MS, withTimeout } from './http';
import { createLimiter } from './limiter';

const limit = createLimiter(4);
const READ_TIMEOUT_MS = 15000;
const RETRY_DELAY_MS = 600;
let requestId = Date.now();

interface RpcResponse<T> { result?: T; error?: { message?: string } }

function call<T>(url: string, method: string, params: object, token?: string, timeout = REQUEST_TIMEOUT_MS): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers['X-Lbry-Auth-Token'] = token;
  return withTimeout(async (signal) => {
    const response = await fetch(`${url}?m=${method}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++requestId }),
      signal,
    });
    const data = (await response.json()) as RpcResponse<T>;
    if (data.error) throw new Error(data.error.message || 'LBRY API error');
    return data.result as T;
  }, timeout);
}

async function read<T>(method: string, params: object): Promise<T> {
  try {
    return await call<T>(LBRY_API_URL, method, params, undefined, READ_TIMEOUT_MS);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return call<T>(LBRY_API_URL, method, params, undefined, READ_TIMEOUT_MS);
  }
}

export const PRIORITY_FOREGROUND = 10;
export const PRIORITY_BACKGROUND = 0;

export function lbryRpc<T>(method: string, params: object, priority = PRIORITY_FOREGROUND) {
  return limit(() => read<T>(method, params), priority);
}

export function lbryRpcAuthenticated<T>(method: string, params: object, token: string) {
  return call<T>(ODYSEE_PROXY_URL, method, params, token);
}
