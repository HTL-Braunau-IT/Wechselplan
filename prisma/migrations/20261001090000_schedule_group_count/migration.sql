-- A weekday plan's group count. Groups otherwise exist only through the students
-- placed in them (StudentWeekdayGroup), so a deliberately empty group — a small
-- class with more teachers than groups, where one teacher has the free slot —
-- vanished on save. Null = derive from the students, as before.
ALTER TABLE "Schedule" ADD COLUMN "groupCount" INTEGER;
