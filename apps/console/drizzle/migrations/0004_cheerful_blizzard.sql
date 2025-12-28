CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "totp_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "totp_verifications_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "totp_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "totp_recovery_codes" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_verifications" ADD CONSTRAINT "totp_verifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_totp_verifications_token" ON "totp_verifications" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_totp_verifications_user_id" ON "totp_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_totp_verifications_expires_at" ON "totp_verifications" USING btree ("expires_at");