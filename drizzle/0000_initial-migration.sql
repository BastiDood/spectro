CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."channel" (
	"id" bigint PRIMARY KEY NOT NULL,
	"guild_id" bigint NOT NULL,
	"disabled_at" timestamp with time zone,
	"color" bit(24),
	"is_approval_required" boolean DEFAULT false NOT NULL,
	"label" text DEFAULT 'Confession' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."confession" (
	"internal_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."confession_internal_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" bigint NOT NULL,
	"parent_message_id" bigint,
	"confession_id" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now(),
	"author_id" bigint NOT NULL,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."guild" (
	"id" bigint PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"icon_hash" text,
	"splash_hash" text,
	"last_confession_id" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."permission" (
	"guild_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"is_admin" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app"."user" (
	"id" bigint PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"avatar_hash" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."channel" ADD CONSTRAINT "channel_guild_id_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "app"."guild"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."confession" ADD CONSTRAINT "confession_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "app"."channel"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."confession" ADD CONSTRAINT "confession_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "app"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."permission" ADD CONSTRAINT "permission_guild_id_guild_id_fk" FOREIGN KEY ("guild_id") REFERENCES "app"."guild"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app"."permission" ADD CONSTRAINT "permission_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "guild_to_channel_unique_idx" ON "app"."channel" USING btree ("guild_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "confession_to_channel_unique_idx" ON "app"."confession" USING btree ("confession_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_to_guild_unique_idx" ON "app"."permission" USING btree ("user_id","guild_id");
