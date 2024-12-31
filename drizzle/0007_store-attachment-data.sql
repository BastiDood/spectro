CREATE TABLE "app"."attachment_data" (
	"id" bigint PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"title" text,
	"description" text,
	"content_type" text,
	"size" integer NOT NULL,
	"url" text NOT NULL,
	"proxy_url" text NOT NULL,
	"height" integer,
	"width" integer
);
--> statement-breakpoint
ALTER TABLE "app"."confession" ADD COLUMN "attachment_id" bigint;--> statement-breakpoint
ALTER TABLE "app"."confession" ADD CONSTRAINT "confession_attachment_id_attachment_data_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "app"."attachment_data"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "confession_to_attachment_unique_idx" ON "app"."confession" USING btree ("confession_id","attachment_id");