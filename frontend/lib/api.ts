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
