CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "AuditEvent" ALTER COLUMN "prevHash" TYPE VARCHAR(64);
ALTER TABLE "AuditEvent" ALTER COLUMN "eventHash" TYPE VARCHAR(64);

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_prevHash_format_check"
  CHECK ("prevHash" IS NULL OR "prevHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "AuditEvent"
  ADD CONSTRAINT "AuditEvent_eventHash_format_check"
  CHECK ("eventHash" IS NULL OR "eventHash" ~ '^[0-9a-f]{64}$');

CREATE INDEX "AuditEvent_householdId_eventHash_idx" ON "AuditEvent"("householdId", "eventHash");

CREATE OR REPLACE FUNCTION roompire_audit_event_hash_payload(
  event_id UUID,
  household_id UUID,
  actor_user_id UUID,
  action TEXT,
  entity_type TEXT,
  entity_id UUID,
  before_value JSONB,
  after_value JSONB,
  metadata_value JSONB,
  previous_hash TEXT,
  occurred_at TIMESTAMP(3)
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'action', action,
    'actorUserId', CASE WHEN actor_user_id IS NULL THEN NULL ELSE actor_user_id::TEXT END,
    'after', after_value,
    'before', before_value,
    'entityId', entity_id::TEXT,
    'entityType', entity_type,
    'householdId', household_id::TEXT,
    'id', event_id::TEXT,
    'metadata', metadata_value,
    'occurredAt', to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'prevHash', previous_hash
  )::TEXT;
$$;

DO $$
DECLARE
  current_household_id UUID;
  current_event RECORD;
  previous_hash TEXT;
  next_hash TEXT;
BEGIN
  FOR current_household_id IN
    SELECT DISTINCT "householdId" FROM "AuditEvent" ORDER BY "householdId"
  LOOP
    previous_hash := NULL;

    FOR current_event IN
      SELECT *
      FROM "AuditEvent"
      WHERE "householdId" = current_household_id
      ORDER BY "occurredAt" ASC, "id" ASC
    LOOP
      next_hash := encode(
        digest(
          roompire_audit_event_hash_payload(
            current_event."id",
            current_event."householdId",
            current_event."actorUserId",
            current_event."action",
            current_event."entityType",
            current_event."entityId",
            current_event."before",
            current_event."after",
            current_event."metadata",
            previous_hash,
            current_event."occurredAt"
          ),
          'sha256'
        ),
        'hex'
      );

      UPDATE "AuditEvent"
      SET "prevHash" = previous_hash,
          "eventHash" = next_hash
      WHERE "id" = current_event."id";

      previous_hash := next_hash;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION roompire_set_audit_event_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  previous_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW."householdId"::TEXT));

  SELECT "eventHash"
  INTO previous_hash
  FROM "AuditEvent"
  WHERE "householdId" = NEW."householdId"
  ORDER BY "occurredAt" DESC, "id" DESC
  LIMIT 1;

  NEW."prevHash" := previous_hash;
  NEW."eventHash" := encode(
    digest(
      roompire_audit_event_hash_payload(
        NEW."id",
        NEW."householdId",
        NEW."actorUserId",
        NEW."action",
        NEW."entityType",
        NEW."entityId",
        NEW."before",
        NEW."after",
        NEW."metadata",
        NEW."prevHash",
        NEW."occurredAt"
      ),
      'sha256'
    ),
    'hex'
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditEvent_set_hash_chain"
BEFORE INSERT ON "AuditEvent"
FOR EACH ROW
EXECUTE FUNCTION roompire_set_audit_event_hash();
