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

-- App collections (mirrors the frontend stores; dates/amounts kept as TEXT
-- because the UI treats them as opaque display strings).
CREATE TABLE IF NOT EXISTS students (
  student_id VARCHAR(30) PRIMARY KEY,
  student_name VARCHAR(200) NOT NULL,
  dob TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  guardian TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  class_group TEXT NOT NULL DEFAULT '',
  course TEXT NOT NULL DEFAULT '',
  joining_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS student_groups (
  group_id VARCHAR(30) PRIMARY KEY,
  group_name VARCHAR(200) NOT NULL,
  course TEXT NOT NULL DEFAULT '',
  batch TEXT NOT NULL DEFAULT '',
  fee_amount TEXT NOT NULL DEFAULT '',
  fee_frequency TEXT NOT NULL DEFAULT 'Monthly',
  start_date TEXT NOT NULL DEFAULT '',
  end_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  student_ids TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS fee_structures (
  structure_id VARCHAR(30) PRIMARY KEY,
  structure_name VARCHAR(200) NOT NULL,
  course_group TEXT NOT NULL DEFAULT '',
  fee_type TEXT NOT NULL DEFAULT 'Tuition Fee',
  amount TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT 'Monthly',
  due_date TEXT NOT NULL DEFAULT '',
  late_fee TEXT NOT NULL DEFAULT '',
  payment_methods TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'Active',
  description TEXT NOT NULL DEFAULT '',
  student_ids TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS receipts (
  receipt_id VARCHAR(30) PRIMARY KEY,
  student_id TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'Cash',
  payment_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Paid',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id VARCHAR(30) PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  recipient_ids TEXT[] NOT NULL DEFAULT '{}',
  recipient_names TEXT[] NOT NULL DEFAULT '{}',
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dropdown_options (
  list_key TEXT PRIMARY KEY,
  options TEXT[] NOT NULL DEFAULT '{}'
);
