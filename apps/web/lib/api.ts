const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export async function api<T>(path: string, rmId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-RM-ID': rmId, ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ code: 'REQUEST_FAILED', message: 'Request failed' }));
    throw new ApiError(body.code ?? 'REQUEST_FAILED', body.message ?? 'Request failed', response.status);
  }
  return response.json() as Promise<T>;
}

export const money = (value: string | number, locale: 'vi' | 'en' = 'vi') =>
  new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));

