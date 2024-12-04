CREATE SCHEMA "oauth";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth"."pendings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT NOW() + INTERVAL '15 minutes' NOT NULL,
	"nonce" "bytea" DEFAULT gen_random_bytes(64) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth"."sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_id" bigint NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."user" ADD COLUMN "discriminator" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."user" ADD COLUMN "global_name" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "oauth"."sessions" ADD CONSTRAINT "sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
