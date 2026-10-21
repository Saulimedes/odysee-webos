import { LBRY_API_URL, ODYSEE_PROXY_URL } from '@/shared/config';
import { createLimiter } from './limiter';

const limit = createLimiter(4);
let requestId = Date.now();

interface RpcResponse<T> { result?: T; error?: { message?: string } }

async function call<T>(url: string, method: string, params: object, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers['X-Lbry-Auth-Token'] = token;
  const response = await fetch(`${url}?m=${method}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++requestId }),
  });
  const data = (await response.json()) as RpcResponse<T>;
  if (data.error) throw new Error(data.error.message || 'LBRY API error');
  return data.result as T;
}

export const PRIORITY_FOREGROUND = 10;
export const PRIORITY_BACKGROUND = 0;

export function lbryRpc<T>(method: string, params: object, priority = PRIORITY_FOREGROUND) {
  return limit(() => call<T>(LBRY_API_URL, method, params), priority);
}

export function lbryRpcAuthenticated<T>(method: string, params: object, token: string) {
  return call<T>(ODYSEE_PROXY_URL, method, params, token);
}
