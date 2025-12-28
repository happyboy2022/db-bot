CREATE TYPE "public"."approval_decision" AS ENUM('APPROVE', 'REJECT', 'CHANGES_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."db_type" AS ENUM('polardb_mysql', 'redis', 'adb');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('EXECUTING', 'SUCCEEDED', 'FAILED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDING_APPROVAL', 'CHANGES_REQUESTED', 'REJECTED', 'APPROVED', 'APPROVAL_EXPIRED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."statement_status" AS ENUM('PENDING', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."statement_type" AS ENUM('select', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('PENDING', 'USER', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" "user_role" DEFAULT 'PENDING' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_at" timestamp with time zone,
	"activated_by" text
);
--> statement-breakpoint
CREATE TABLE "clusters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"region" text,
	"doppler_token_encrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "clusters_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "db_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"db_type" "db_type" NOT NULL,
	"code" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sql_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_id" uuid NOT NULL,
	"created_by" text NOT NULL,
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
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sql_request_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"exec_status" "statement_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_request_target" UNIQUE("request_id","target_id")
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
	"executed_by" text,
	"executed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sql_statement_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"statement_id" uuid NOT NULL,
	"target_id" uuid,
	"status" "execution_status" NOT NULL,
	"result" jsonb,
	"process_id" bigint,
	"duration_ms" integer,
	"executed_by" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"comment" text,
	"decided_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
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
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "db_targets" ADD CONSTRAINT "db_targets_cluster_id_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."clusters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "db_targets" ADD CONSTRAINT "db_targets_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_requests" ADD CONSTRAINT "sql_requests_target_id_db_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."db_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_requests" ADD CONSTRAINT "sql_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_request_versions" ADD CONSTRAINT "sql_request_versions_request_id_sql_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sql_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_request_versions" ADD CONSTRAINT "sql_request_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_request_targets" ADD CONSTRAINT "sql_request_targets_request_id_sql_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sql_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_request_targets" ADD CONSTRAINT "sql_request_targets_target_id_db_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."db_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statements" ADD CONSTRAINT "sql_statements_version_id_sql_request_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sql_request_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statements" ADD CONSTRAINT "sql_statements_executed_by_profiles_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statement_executions" ADD CONSTRAINT "sql_statement_executions_statement_id_sql_statements_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."sql_statements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statement_executions" ADD CONSTRAINT "sql_statement_executions_target_id_db_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."db_targets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_statement_executions" ADD CONSTRAINT "sql_statement_executions_executed_by_profiles_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_request_id_sql_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."sql_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_version_id_sql_request_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."sql_request_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_profiles_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sql_templates" ADD CONSTRAINT "sql_templates_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user_id" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_token" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_verifications_identifier" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_profiles_email" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_profiles_role" ON "profiles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_profiles_status" ON "profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_clusters_name" ON "clusters" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_clusters_enabled" ON "clusters" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_db_targets_cluster_id" ON "db_targets" USING btree ("cluster_id");--> statement-breakpoint
CREATE INDEX "idx_db_targets_cluster_code" ON "db_targets" USING btree ("cluster_id","code");--> statement-breakpoint
CREATE INDEX "idx_db_targets_enabled" ON "db_targets" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_requests_created_by" ON "sql_requests" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_requests_status" ON "sql_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_requests_target_id" ON "sql_requests" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_versions_request_id" ON "sql_request_versions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_request_targets_request" ON "sql_request_targets" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_request_targets_target" ON "sql_request_targets" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_statements_version_id" ON "sql_statements" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "idx_executions_statement_id" ON "sql_statement_executions" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "idx_executions_target_id" ON "sql_statement_executions" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_executions_started_at" ON "sql_statement_executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_approvals_request_id" ON "approvals" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");