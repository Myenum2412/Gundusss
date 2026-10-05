-- Demo seed for all app pages. Idempotent: re-running changes nothing.
-- Run: psql $DATABASE_URL -f ./sql/seed-demo.sql

-- ---------- Students ----------
INSERT INTO students (student_id, student_name, dob, gender, guardian, phone, email, address, class_group, course, joining_date, status) VALUES
  ('STU-001', 'Aarav Sharma', '2012-05-14', 'Male', 'Rajesh Sharma', '919876543201', 'aarav.sharma@example.com', '12 MG Road, Jaipur', 'Class 10', 'Science', '2026-06-10', 'Active'),
  ('STU-002', 'Diya Patel', '2013-08-22', 'Female', 'Suresh Patel', '919876543202', 'diya.patel@example.com', '45 CG Road, Ahmedabad', 'Class 10', 'Science', '2026-06-12', 'Active'),
  ('STU-003', 'Kabir Singh', '2012-11-03', 'Male', 'Harpreet Singh', '919876543203', 'kabir.singh@example.com', '7 Model Town, Delhi', 'Class 9', 'Commerce', '2026-07-05', 'Active'),
  ('STU-004', 'Ananya Iyer', '2014-02-17', 'Female', 'Lakshmi Iyer', '919876543204', 'ananya.iyer@example.com', '3 Anna Nagar, Chennai', 'Class 8', 'Arts', '2026-07-20', 'Active'),
  ('STU-005', 'Vihaan Gupta', '2011-09-30', 'Male', 'Amit Gupta', '919876543205', 'vihaan.gupta@example.com', '21 Sector 62, Noida', 'Class 10', 'Science', '2026-09-02', 'Active'),
  ('STU-006', 'Ishita Verma', '2013-04-11', 'Female', 'Neha Verma', '919876543206', 'ishita.verma@example.com', '9 Gomti Nagar, Lucknow', 'Class 9', 'Commerce', '2026-09-15', 'Active'),
  ('STU-007', 'Arjun Nair', '2012-12-25', 'Male', 'Suresh Nair', '919876543207', 'arjun.nair@example.com', '14 Kochi Marine Drive, Kochi', 'Class 10', 'General', '2026-10-01', 'Active'),
  ('STU-008', 'Myra Khan', '2014-06-08', 'Female', 'Imran Khan', '919876543208', 'myra.khan@example.com', '6 Park Street, Kolkata', 'Class 8', 'Arts', '2026-10-03', 'Inactive')
ON CONFLICT (student_id) DO NOTHING;

-- ---------- Student groups ----------
INSERT INTO student_groups (group_id, group_name, course, batch, fee_amount, fee_frequency, start_date, end_date, description, student_ids) VALUES
  ('GRP-001', 'Science Batch A', 'Science', '2026 Batch', '5000', 'Monthly', '2026-06-01', '2027-05-31', 'Class 10 science morning batch', ARRAY['STU-001', 'STU-002', 'STU-005']),
  ('GRP-002', 'Commerce Batch B', 'Commerce', '2026 Batch', '4500', 'Quarterly', '2026-07-01', '2027-06-30', 'Class 9 commerce afternoon batch', ARRAY['STU-003', 'STU-006']),
  ('GRP-003', 'Arts Evening', 'Arts', '2026 Batch', '3000', 'Monthly', '2026-09-01', '2027-05-31', 'Evening arts batch for Class 8', ARRAY['STU-004', 'STU-008'])
ON CONFLICT (group_id) DO NOTHING;

-- ---------- Fee structures ----------
INSERT INTO fee_structures (structure_id, structure_name, course_group, fee_type, amount, frequency, due_date, late_fee, payment_methods, status, description, student_ids) VALUES
  ('FEE-001', 'Class 10 Tuition 2026', 'Science Batch A (GRP-001)', 'Tuition Fee', '5000', 'Monthly', 'Every month: 5th', '200', ARRAY['Cash', 'UPI', 'Bank Transfer'], 'Active', 'Monthly tuition for the science batch', ARRAY['STU-001', 'STU-002', 'STU-005']),
  ('FEE-002', 'Admission Fee 2026', 'Science', 'Admission Fee', '10000', 'One-Time', 'At admission', '0', ARRAY['Cash', 'Bank Transfer'], 'Active', 'One-time admission charge for new enrolments', ARRAY['STU-001', 'STU-002']),
  ('FEE-003', 'Exam Fee Term 1', 'Commerce Batch B (GRP-002)', 'Exam Fee', '1500', 'One-Time', '30th Sep', '100', ARRAY['UPI'], 'Active', 'Term 1 examination fee', ARRAY['STU-003', 'STU-006']),
  ('FEE-004', 'Transport Fee', 'General', 'Transport Fee', '1200', 'Monthly', 'Every month: 10th', '50', ARRAY['Cash', 'UPI'], 'Inactive', 'School bus charges (paused route)', ARRAY['STU-007'])
ON CONFLICT (structure_id) DO NOTHING;

-- ---------- Receipts ----------
INSERT INTO receipts (receipt_id, student_id, student_name, amount, method, payment_date, status, notes) VALUES
  ('RCP-001', 'STU-001', 'Aarav Sharma', '5000', 'UPI', '2026-09-05', 'Paid', 'September tuition'),
  ('RCP-002', 'STU-002', 'Diya Patel', '5000', 'Cash', '2026-09-06', 'Paid', ''),
  ('RCP-003', 'STU-003', 'Kabir Singh', '4500', 'Bank Transfer', '2026-09-10', 'Paid', 'Q3 commerce fee'),
  ('RCP-004', 'STU-004', 'Ananya Iyer', '3000', 'UPI', '2026-09-12', 'Paid', ''),
  ('RCP-005', 'STU-005', 'Vihaan Gupta', '5000', 'UPI', '2026-10-05', 'Paid', 'October tuition'),
  ('RCP-006', 'STU-006', 'Ishita Verma', '4500', 'Cash', '2026-10-04', 'Pending', 'Awaiting confirmation'),
  ('RCP-007', 'STU-001', 'Aarav Sharma', '10000', 'Bank Transfer', '2026-06-15', 'Paid', 'Admission fee'),
  ('RCP-008', 'STU-007', 'Arjun Nair', '1200', 'Cash', '2026-10-02', 'Paid', 'Transport October')
ON CONFLICT (receipt_id) DO NOTHING;

-- ---------- Announcements ----------
INSERT INTO announcements (announcement_id, title, message, recipient_ids, recipient_names, sent_count, failed_count, status, created_at) VALUES
  ('ANN-001', 'Fee due reminder', 'Dear parents, October fees are due on the 5th. Please pay on time to avoid late charges.',
    ARRAY['STU-001', 'STU-002', 'STU-005'],
    ARRAY['Aarav Sharma (STU-001)', 'Diya Patel (STU-002)', 'Vihaan Gupta (STU-005)'],
    3, 0, 'Sent', '2026-10-01T09:00:00Z'),
  ('ANN-002', 'Diwali holidays', 'School will remain closed from Oct 20 to Oct 24 for Diwali. Classes resume Oct 25.',
    ARRAY['STU-001', 'STU-002', 'STU-003', 'STU-004', 'STU-005', 'STU-006', 'STU-007', 'STU-008'],
    ARRAY['Aarav Sharma (STU-001)', 'Diya Patel (STU-002)', 'Kabir Singh (STU-003)', 'Ananya Iyer (STU-004)', 'Vihaan Gupta (STU-005)', 'Ishita Verma (STU-006)', 'Arjun Nair (STU-007)', 'Myra Khan (STU-008)'],
    7, 1, 'Partial', '2026-09-25T10:30:00Z'),
  ('ANN-003', 'Exam schedule', 'Term 1 exams begin Sep 15. The timetable has been shared with class groups.',
    ARRAY['STU-003', 'STU-006'],
    ARRAY['Kabir Singh (STU-003)', 'Ishita Verma (STU-006)'],
    2, 0, 'Sent', '2026-09-10T08:00:00Z')
ON CONFLICT (announcement_id) DO NOTHING;
