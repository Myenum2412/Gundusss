'use client';

import { useEffect, useState } from 'react';
import { getFees, createFee, deleteFee, type Fee } from '../lib/api';

export default function Home() {
  const [fees, setFees] = useState<Fee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    student_name: '',
    amount: '',
    status: 'pending',
    due_date: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    try {
      setLoading(true);
      setFees(await getFees());
    } catch (e: any) {
      setError(e.message ?? 'Backend unreachable. Is Fastify running on :4000?');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await createFee({
        student_name: form.student_name,
        amount: Number(form.amount),
        status: form.status,
        due_date: form.due_date,
      });
      setForm({ student_name: '', amount: '', status: 'pending', due_date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function onDelete(id: number) {
    await deleteFee(id);
    await load();
  }

  return (
    <main className="container">
      <h1>Fees Manager</h1>
      <p>Next.js frontend → Fastify API → Postgres</p>

      <div className="card">
        <h2>Add fee</h2>
        <form className="grid" onSubmit={onSubmit}>
          <input
            placeholder="Student name"
            value={form.student_name}
            onChange={(e) => setForm({ ...form, student_name: e.target.value })}
            required
          />
          <input
            placeholder="Amount"
            type="number"
            step="0.01"
            min="0"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="pending">pending</option>
            <option value="paid">paid</option>
            <option value="overdue">overdue</option>
          </select>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            required
          />
          <button type="submit">Create</button>
          <button type="button" className="secondary" onClick={load}>
            Refresh
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>All fees ({fees.length})</h2>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Student</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id}>
                  <td>{f.id}</td>
                  <td>{f.student_name}</td>
                  <td>{f.amount}</td>
                  <td>
                    <span className={`badge ${f.status}`}>{f.status}</span>
                  </td>
                  <td>{f.due_date.slice(0, 10)}</td>
                  <td>
                    <button className="secondary" onClick={() => onDelete(f.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
