-- A failed Inbox message must remain explainable after the live toast has
-- disappeared. The worker writes its final, safe delivery reason here.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_error TEXT NULL AFTER status;
