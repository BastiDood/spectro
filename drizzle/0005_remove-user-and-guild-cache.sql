ALTER TABLE "app"."user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth"."pendings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oauth"."sessions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app"."confession" DROP CONSTRAINT "confession_author_id_user_id_fk";
DROP TABLE "app"."user" CASCADE;--> statement-breakpoint
DROP TABLE "oauth"."pendings" CASCADE;--> statement-breakpoint
DROP TABLE "oauth"."sessions" CASCADE;--> statement-breakpoint
--> statement-breakpoint
ALTER TABLE "app"."guild" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app"."guild" DROP COLUMN IF EXISTS "updated_at";--> statement-breakpoint
ALTER TABLE "app"."guild" DROP COLUMN IF EXISTS "name";--> statement-breakpoint
ALTER TABLE "app"."guild" DROP COLUMN IF EXISTS "icon_hash";--> statement-breakpoint
ALTER TABLE "app"."guild" DROP COLUMN IF EXISTS "splash_hash";--> statement-breakpoint
DROP SCHEMA "oauth";
