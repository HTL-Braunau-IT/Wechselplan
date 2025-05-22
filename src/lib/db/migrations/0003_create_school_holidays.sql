CREATE TABLE IF NOT EXISTS school_holidays (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add some example holidays for the current school year
INSERT INTO school_holidays (name, start_date, end_date) VALUES
  ('Summer Break', '2024-07-01', '2024-09-01'),
  ('Christmas Break', '2024-12-23', '2025-01-06'),
  ('Easter Break', '2025-03-29', '2025-04-07'),
  ('Autumn Break', '2024-10-26', '2024-11-03'); 