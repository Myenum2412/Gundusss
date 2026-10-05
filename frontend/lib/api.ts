export interface Fee {
  id: number;
  student_name: string;
  amount: string | number;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  created_at: string;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function getFees(): Promise<Fee[]> {
  const res = await fetch(`${BASE}/api/fees`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch fees');
  const json = await res.json();
  return json.data;
}

export async function createFee(input: {
  student_name: string;
  amount: number;
  status: string;
  due_date: string;
}): Promise<Fee> {
  const res = await fetch(`${BASE}/api/fees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create fee');
  const json = await res.json();
  return json.data;
}

export async function deleteFee(id: number): Promise<void> {
  const res = await fetch(`${BASE}/api/fees/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete fee');
}

export interface AuthUser {
  id: number;
  email: string;
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Login failed');
  return json.data as AuthUser;
}

export interface WaState {
  status: 'idle' | 'starting' | 'qr' | 'ready' | 'disconnected' | 'error';
  hasQr: boolean;
  qr: string | null;
  connectedNumber: string | null;
  lastError: string | null;
}

async function waReq(path: string, init?: RequestInit): Promise<WaState> {
  const res = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    ...init,
  });
  const json = await res.json().catch(() => ({}));
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

export async function sendWaMessage(input: {
  to: string;
  message: string;
}): Promise<{ id: string | null; to: string }> {
  const res = await fetch(`${BASE}/api/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Failed to send message');
  return json.data;
}
