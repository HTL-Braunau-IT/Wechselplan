-- Whether the Noten "Tabelle" view shows the 2. Note columns, remembered per
-- teacher like the Sitzplan default. On by default.
ALTER TABLE "NotenViewPreference" ADD COLUMN "tableSecondMark" BOOLEAN NOT NULL DEFAULT true;
