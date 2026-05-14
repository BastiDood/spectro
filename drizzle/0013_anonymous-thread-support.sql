CREATE TYPE "app"."pending_channel_thread_kind" AS ENUM('new-thread');--> statement-breakpoint
CREATE TABLE "app"."approved_channel_thread" (
	"thread_id" bigint PRIMARY KEY NOT NULL,
	"pending_channel_thread_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_channel_thread_pending_channel_thread_id_unique" UNIQUE("pending_channel_thread_id")
);
--> statement-breakpoint
CREATE TABLE "app"."pending_channel_thread" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "app"."pending_channel_thread_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"channel_id" bigint NOT NULL,
	"kind" "app"."pending_channel_thread_kind" NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."confession" ADD COLUMN "pending_channel_thread_id" bigint;--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" ADD CONSTRAINT "approved_channel_thread_pending_channel_thread_id_pending_channel_thread_id_fk" FOREIGN KEY ("pending_channel_thread_id") REFERENCES "app"."pending_channel_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_channel_thread" ADD CONSTRAINT "pending_channel_thread_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "app"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_channel_thread_channel_id_idx" ON "app"."pending_channel_thread" USING btree ("channel_id");--> statement-breakpoint
ALTER TABLE "app"."confession" ADD CONSTRAINT "confession_pending_channel_thread_id_pending_channel_thread_id_fk" FOREIGN KEY ("pending_channel_thread_id") REFERENCES "app"."pending_channel_thread"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "confession_channel_id_idx" ON "app"."confession" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "confession_pending_channel_thread_id_idx" ON "app"."confession" USING btree ("pending_channel_thread_id") WHERE "app"."confession"."pending_channel_thread_id" is not null;