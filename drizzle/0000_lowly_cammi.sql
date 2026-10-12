CREATE TYPE "public"."reservation_status" AS ENUM('pending_no_receipt', 'pending_review', 'approved', 'rejected', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" varchar(320) NOT NULL,
	"whatsapp" varchar(32) NOT NULL,
	"marketing_consent" boolean DEFAULT false NOT NULL,
	"marketing_consent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"theme" text,
	"description" text,
	"image_url" text,
	"location" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "reservation_status" DEFAULT 'pending_no_receipt' NOT NULL,
	"public_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"transfer_holder" text,
	"transfer_amount" numeric(10, 2),
	"transfer_date" date,
	"transfer_reference" text,
	"receipt_path" text,
	"receipt_mime_type" text,
	"receipt_uploaded_at" timestamp with time zone,
	"has_condition" boolean NOT NULL,
	"condition_details" text,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"rejection_reason" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_unique" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_public_token_unique" ON "reservations" USING btree ("public_token");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_active_per_person_unique" ON "reservations" USING btree ("event_id","customer_id") WHERE "reservations"."status" in ('pending_no_receipt', 'pending_review', 'approved');--> statement-breakpoint
CREATE INDEX "reservations_event_status_idx" ON "reservations" USING btree ("event_id","status");