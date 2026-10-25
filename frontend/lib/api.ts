import { apiFetch, readData } from './api-base';
import { canWriteStored } from './session';

export interface Fee {
  id: number;
  student_name: string;
  amount: string | number;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  created_at: string;
}

export async function getFees(): Promise<Fee[]> {
  const res = await apiFetch('/api/fees');
  return readData<Fee[]>(res);
}

export async function createFee(input: {
  student_name: string;
  amount: number;
  status: string;
  due_date: string;
}): Promise<Fee> {
  const res = await apiFetch('/api/fees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return readData<Fee>(res);
}

export async function deleteFee(id: number): Promise<void> {
  const res = await apiFetch(`/api/fees/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error ?? 'Failed to delete fee');
  }
}

export interface WaState {
  status: 'idle' | 'starting' | 'qr' | 'ready' | 'disconnected' | 'error';
  hasQr: boolean;
  qr: string | null;
  connectedNumber: string | null;
  lastError: string | null;
}

async function waReq(path: string, init?: RequestInit): Promise<WaState> {
  const res = await apiFetch(path, init);
  const json = (await res.json().catch(() => ({}))) as {
    data?: WaState;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? 'WhatsApp request failed');
  return json.data as WaState;
}

export function getWaStatus(): Promise<WaState> {
  return waReq('/api/whatsapp/status');
}

export function startWa(): Promise<WaState> {
  return waReq('/api/whatsapp/start', { method: 'POST' });
}

export function logoutWa(): Promise<WaState> {
  return waReq('/api/whatsapp/logout', { method: 'POST' });
}

export interface WaCtaUrl {
  displayText: string;
  url: string;
}

export async function sendWaMessage(input: {
  to: string;
  message: string;
  /** Optional base64 file payload sent right after the text message. */
  attachment?: { name: string; mime: string; data: string };
  /** Optional WhatsApp-native CTA-URL button */
  cta?: WaCtaUrl;
}): Promise<{ id: string | null; to: string }> {
  const res = await apiFetch('/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { id: string | null; to: string };
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? 'Failed to send message');
  return json.data as { id: string | null; to: string };
}

// Generic collection sync used by the *-store modules. Appwrite (through the
// backend API) is the only source of truth; nothing is cached in the browser.
export async function getCollection<T>(name: string): Promise<T[]> {
  const res = await apiFetch(`/api/${name}`);
  const json = (await res.json().catch(() => ({}))) as {
    data?: T[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? `Failed to load ${name}`);
  return (json.data ?? []) as T[];
}

export async function replaceCollection(name: string, items: unknown): Promise<void> {
  if (!canWriteStored()) {
    throw new Error('Your account is read-only.');
  }
  const res = await apiFetch(`/api/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Failed to save ${name}`);
}

export async function getDropdowns(): Promise<Record<string, string[]>> {
  const res = await apiFetch('/api/dropdowns');
  const json = (await res.json().catch(() => ({}))) as {
    data?: Record<string, string[]>;
    error?: string;
  };
  if (!res.ok) throw new Error(json.error ?? 'Failed to load dropdowns');
  return (json.data ?? {}) as Record<string, string[]>;
}

export async function saveDropdownsApi(dropdowns: Record<string, string[]>): Promise<void> {
  if (!canWriteStored()) {
    throw new Error('Your account is read-only.');
  }
  const res = await apiFetch('/api/dropdowns', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dropdowns }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? 'Failed to save dropdowns');
}
