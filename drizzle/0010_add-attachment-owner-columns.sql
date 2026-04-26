ALTER TABLE "app"."durable_attachment" ADD COLUMN "ephemeral_attachment_id" bigint;--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ADD COLUMN "confession_internal_id" bigint;--> statement-breakpoint
ALTER TABLE "app"."durable_attachment" ADD CONSTRAINT "durable_attachment_ephemeral_attachment_id_unique" UNIQUE("ephemeral_attachment_id");--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ADD CONSTRAINT "ephemeral_attachment_confession_internal_id_unique" UNIQUE("confession_internal_id");