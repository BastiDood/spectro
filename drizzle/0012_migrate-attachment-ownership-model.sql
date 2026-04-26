ALTER TABLE "app"."ephemeral_attachment" DROP CONSTRAINT "ephemeral_attachment_durable_attachment_id_unique";--> statement-breakpoint
ALTER TABLE "app"."confession" DROP CONSTRAINT "confession_attachment_id_ephemeral_attachment_id_fk";
--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" DROP CONSTRAINT "ephemeral_attachment_durable_attachment_id_durable_attachment_id_fk";
--> statement-breakpoint
DROP INDEX "app"."confession_to_attachment_unique_idx";--> statement-breakpoint
ALTER TABLE "app"."durable_attachment" ALTER COLUMN "ephemeral_attachment_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ALTER COLUMN "confession_internal_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."durable_attachment" ADD CONSTRAINT "durable_attachment_ephemeral_attachment_id_ephemeral_attachment_id_fk" FOREIGN KEY ("ephemeral_attachment_id") REFERENCES "app"."ephemeral_attachment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" ADD CONSTRAINT "ephemeral_attachment_confession_internal_id_confession_internal_id_fk" FOREIGN KEY ("confession_internal_id") REFERENCES "app"."confession"("internal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."confession" DROP COLUMN "attachment_id";--> statement-breakpoint
ALTER TABLE "app"."ephemeral_attachment" DROP COLUMN "durable_attachment_id";