CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apartments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"public_slug" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"office_phone" text DEFAULT '' NOT NULL,
	"sms_mode" text DEFAULT 'test' NOT NULL,
	"sender_number" text DEFAULT '' NOT NULL,
	"rate_sms" numeric(10, 2) NOT NULL,
	"rate_lms" numeric(10, 2) NOT NULL,
	"rate_source" text DEFAULT '' NOT NULL,
	"rate_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"daily_send_limit" integer DEFAULT 3000 NOT NULL,
	"include_link_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apartments_public_slug_unique" UNIQUE("public_slug")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid,
	"admin_id" uuid,
	"admin_name" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"detail" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_last4" text NOT NULL,
	"consent_status" text DEFAULT 'pending' NOT NULL,
	"consent_basis" text DEFAULT '' NOT NULL,
	"consent_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"inactive_reason" text,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"contact_id" uuid,
	"unit_label" text NOT NULL,
	"phone_enc" text NOT NULL,
	"phone_hash" text NOT NULL,
	"phone_last4" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_message_id" text,
	"status_code" text,
	"status_message" text,
	"message_type" text,
	"cost" numeric(10, 2),
	"view_token" text,
	"requested_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"notice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"mode" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"only_phone_hashes" jsonb,
	"text_prefix" text DEFAULT '' NOT NULL,
	"message_type" text,
	"rate_snapshot" numeric(10, 2),
	"recipient_count" integer,
	"estimated_cost" numeric(12, 2),
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"target" jsonb NOT NULL,
	"target_label" text NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"is_emergency" boolean DEFAULT false NOT NULL,
	"include_link" boolean DEFAULT false NOT NULL,
	"sms_text" text NOT NULL,
	"sms_text_edited" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"request_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apartment_id" uuid NOT NULL,
	"building_id" uuid NOT NULL,
	"unit_no" text NOT NULL,
	"floor" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admins" ADD CONSTRAINT "admins_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_notice_id_notices_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."notices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_apartment_id_apartments_id_fk" FOREIGN KEY ("apartment_id") REFERENCES "public"."apartments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_uq" ON "admins" USING btree ("email");--> statement-breakpoint
CREATE INDEX "audit_apt_idx" ON "audit_logs" USING btree ("apartment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "buildings_apt_name_uq" ON "buildings" USING btree ("apartment_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_unit_phone_uq" ON "contacts" USING btree ("unit_id","phone_hash");--> statement-breakpoint
CREATE INDEX "contacts_apt_idx" ON "contacts" USING btree ("apartment_id");--> statement-breakpoint
CREATE INDEX "contacts_apt_phone_idx" ON "contacts" USING btree ("apartment_id","phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_dispatch_phone_uq" ON "deliveries" USING btree ("dispatch_id","phone_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_view_token_uq" ON "deliveries" USING btree ("view_token");--> statement-breakpoint
CREATE INDEX "deliveries_status_idx" ON "deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deliveries_apt_idx" ON "deliveries" USING btree ("apartment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatches_idem_uq" ON "dispatches" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "dispatches_due_idx" ON "dispatches" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "dispatches_notice_idx" ON "dispatches" USING btree ("notice_id");--> statement-breakpoint
CREATE INDEX "notices_apt_idx" ON "notices" USING btree ("apartment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notices_request_key_uq" ON "notices" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "sessions_admin_idx" ON "sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_building_no_uq" ON "units" USING btree ("building_id","unit_no");--> statement-breakpoint
CREATE INDEX "units_apt_idx" ON "units" USING btree ("apartment_id");