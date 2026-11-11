export const REQUEST_TIMEOUT_MS = 20000;

export async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms = REQUEST_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return withTimeout(async (signal) => {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as T;
  });
}

export interface FormResult<T> { ok: boolean; status: number; body: T }

export function postForm<T>(url: string, data: Record<string, string>): Promise<FormResult<T>> {
  return withTimeout(async (signal) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(data),
      signal,
    });
    const body = (await response.json()) as T;
    return { ok: response.ok, status: response.status, body };
  });
}
