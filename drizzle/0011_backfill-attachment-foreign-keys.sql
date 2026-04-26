-- Invert the old confession -> ephemeral attachment FK into the new ephemeral attachment -> confession FK.
-- The old schema stored ownership on "confession"."attachment_id"; the new schema stores it on
-- "ephemeral_attachment"."confession_internal_id".
UPDATE "app"."ephemeral_attachment"
SET "confession_internal_id" = "confession"."internal_id"
FROM "app"."confession"
WHERE "confession"."attachment_id" = "ephemeral_attachment"."id";

-- Invert the old ephemeral attachment -> durable attachment FK into the new durable attachment -> ephemeral attachment FK.
-- The old schema stored the durable upgrade link on "ephemeral_attachment"."durable_attachment_id";
-- the new schema stores it on "durable_attachment"."ephemeral_attachment_id".
UPDATE "app"."durable_attachment"
SET "ephemeral_attachment_id" = "ephemeral_attachment"."id"
FROM "app"."ephemeral_attachment"
WHERE "ephemeral_attachment"."durable_attachment_id" = "durable_attachment"."id";

-- Drop durable rows that were linked to ephemeral rows which no longer have an owning confession.
-- These can be produced by rejected confessions under the old schema, where deleting the confession
-- did not cascade to its attachment rows.
DELETE FROM "app"."durable_attachment"
USING "app"."ephemeral_attachment"
WHERE "durable_attachment"."ephemeral_attachment_id" = "ephemeral_attachment"."id" AND "ephemeral_attachment"."confession_internal_id" IS NULL;

-- Drop durable rows that were never linked from any ephemeral row in the old schema.
-- There is no source ephemeral attachment to own them under the new model.
DELETE FROM "app"."durable_attachment"
WHERE "ephemeral_attachment_id" IS NULL;

-- Drop ephemeral rows that were never linked from any confession in the old schema.
-- There is no confession to own them under the new model.
DELETE FROM "app"."ephemeral_attachment"
WHERE "confession_internal_id" IS NULL;
