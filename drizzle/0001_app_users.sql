ALTER TABLE "contacts" ADD COLUMN "uses_other_app" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notices" ADD COLUMN "exclude_app_users" boolean DEFAULT false NOT NULL;