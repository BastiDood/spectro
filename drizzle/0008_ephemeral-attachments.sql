ALTER TABLE "app"."attachment_data" RENAME TO "ephemeral_attachment";--> statement-breakpoint
ALTER TABLE "app"."confession" DROP CONSTRAINT "confession_attachment_id_attachment_data_id_fk";
--> statement-breakpoint
DROP INDEX "app"."guild_to_channel_unique_idx";--> statement-breakpoint
ALTER TABLE "app"."confession" ADD CONSTRAINT "confession_attachment_id_ephemeral_attachment_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "app"."ephemeral_attachment"("id") ON DELETE no action ON UPDATE no action;