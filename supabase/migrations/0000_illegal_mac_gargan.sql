CREATE TYPE "public"."approval_decision" AS ENUM('APPROVE', 'REJECT', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."db_type" AS ENUM('polardb_mysql');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'APPROVAL_EXPIRED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('PENDING', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."statement_type" AS ENUM('select', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PENDING', 'USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'PENDING' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"activated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"region" text,
	"doppler_token_encrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "db_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"db_type" "db_type" NOT NULL,
	"db_role" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sql_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "request_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"current_version_id" uuid,
	"approved_version_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sql_request_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"sql_raw" text NOT NULL,
	"validation_result" jsonb NOT NULL,
	"template_id" uuid,
	"template_snapshot" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sql_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"sql_text" text NOT NULL,
	"type" "statement_type" NOT NULL,
	"precheck_sql" text,
	"validation_result" jsonb NOT NULL,
	"exec_status" "statement_status",
	"exec_result" jsonb,
	"process_id" bigint,
	"duration_ms" integer,
	"executed_by" uuid,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"comment" text,
	"decided_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"payload" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sql_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"db_type" "db_type" NOT NULL,
	"tags" text[],
	"sql_text" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "db_targets" ADD CONSTRAINT "db_targets_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_requests" ADD CONSTRAINT "sql_requests_target_id_db_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."db_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_requests" ADD CONSTRAINT "sql_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_request_versions" ADD CONSTRAINT "sql_request_versions_request_id_sql_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sql_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_request_versions" ADD CONSTRAINT "sql_request_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statements" ADD CONSTRAINT "sql_statements_version_id_sql_request_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sql_request_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statements" ADD CONSTRAINT "sql_statements_executed_by_profiles_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_request_id_sql_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sql_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_version_id_sql_request_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sql_request_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_templates" ADD CONSTRAINT "sql_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_services_name" ON "services" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_services_enabled" ON "services" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_requests_created_by" ON "sql_requests" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_requests_status" ON "sql_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_requests_target_id" ON "sql_requests" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_versions_request_id" ON "sql_request_versions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_statements_version_id" ON "sql_statements" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_approvals_request_id" ON "approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");