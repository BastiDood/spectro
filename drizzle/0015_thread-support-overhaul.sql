CREATE TABLE "app"."pending_channel_thread_title" (
	"confession_internal_id" bigint PRIMARY KEY NOT NULL,
	"pending_channel_thread_id" bigint NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" DROP CONSTRAINT "approved_channel_thread_pending_channel_thread_id_unique";--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" DROP CONSTRAINT "approved_channel_thread_pending_channel_thread_id_pending_channel_thread_id_fk";
--> statement-breakpoint
ALTER TABLE "app"."confession" DROP CONSTRAINT "confession_pending_channel_thread_id_pending_channel_thread_id_fk";
--> statement-breakpoint
DROP INDEX "app"."confession_pending_channel_thread_id_idx";--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" ADD COLUMN "confession_internal_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."pending_channel_thread_title" ADD CONSTRAINT "pending_channel_thread_title_confession_internal_id_confession_internal_id_fk" FOREIGN KEY ("confession_internal_id") REFERENCES "app"."confession"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."pending_channel_thread_title" ADD CONSTRAINT "pending_channel_thread_title_pending_channel_thread_id_pending_channel_thread_id_fk" FOREIGN KEY ("pending_channel_thread_id") REFERENCES "app"."pending_channel_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_channel_thread_title_pending_channel_thread_id_idx" ON "app"."pending_channel_thread_title" USING btree ("pending_channel_thread_id");--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" ADD CONSTRAINT "approved_channel_thread_confession_internal_id_pending_channel_thread_title_confession_internal_id_fk" FOREIGN KEY ("confession_internal_id") REFERENCES "app"."pending_channel_thread_title"("confession_internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_guild_id_idx" ON "app"."channel" USING btree ("guild_id");--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" DROP COLUMN "pending_channel_thread_id";--> statement-breakpoint
ALTER TABLE "app"."confession" DROP COLUMN "pending_channel_thread_id";--> statement-breakpoint
ALTER TABLE "app"."pending_channel_thread" DROP COLUMN "title";--> statement-breakpoint
ALTER TABLE "app"."approved_channel_thread" ADD CONSTRAINT "approved_channel_thread_confession_internal_id_unique" UNIQUE("confession_internal_id");