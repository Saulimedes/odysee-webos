export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export interface FormResult<T> { ok: boolean; status: number; body: T }

export async function postForm<T>(url: string, data: Record<string, string>): Promise<FormResult<T>> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(data),
  });
  const body = (await response.json()) as T;
  return { ok: response.ok, status: response.status, body };
}
