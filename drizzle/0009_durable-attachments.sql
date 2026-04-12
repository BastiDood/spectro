CREATE TABLE "app"."durable_attachment" (
	"id" bigint PRIMARY KEY NOT NULL,
	"message_id" bigint NOT NULL,
	"channel_id" bigint NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"url" text NOT NULL,
	"proxy_url" text NOT NULL,
	"height" integer,
	"width" integer
);
--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ADD COLUMN "durable_attachment_id" bigint;--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ADD CONSTRAINT "ephemeral_attachment_durable_attachment_id_durable_attachment_id_fk" FOREIGN KEY ("durable_attachment_id") REFERENCES "app"."durable_attachment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ADD CONSTRAINT "ephemeral_attachment_durable_attachment_id_unique" UNIQUE("durable_attachment_id");