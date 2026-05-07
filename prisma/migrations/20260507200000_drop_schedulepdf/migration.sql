-- Phase 1a: Remove the unused SchedulePDF table.
-- The model was never written to by feature code; PDFs are generated on-the-fly in
-- src/lib/pdf-generator.ts and streamed to the client. The admin DB viewer was the
-- only consumer and has been removed.

DROP TABLE IF EXISTS "SchedulePDF";
