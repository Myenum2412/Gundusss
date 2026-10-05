CREATE TABLE IF NOT EXISTS fees (
  id SERIAL PRIMARY KEY,
  student_name VARCHAR(200) NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','overdue')),
  due_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO fees (student_name, amount, status, due_date) VALUES
  ('Aarav Sharma', 2500.00, 'pending', CURRENT_DATE + INTERVAL '7 days'),
  ('Diya Patel', 3200.50, 'paid', CURRENT_DATE - INTERVAL '2 days'),
  ('Kabir Singh', 1800.00, 'overdue', CURRENT_DATE - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default login: admin@seedsofsuccess.com / Admin123!
-- Hash generated with bcrypt (cost 10). Re-seeded at backend boot if missing.
INSERT INTO users (email, password_hash) VALUES
  ('admin@seedsofsuccess.com', '$2b$10$PvMlCmSPXftoAb1avFaFzez/AUaD9l.I0cqocMudWPTLW2zE77aeG')
ON CONFLICT (email) DO NOTHING;
