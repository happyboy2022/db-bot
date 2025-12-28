ALTER TABLE "sql_statements" DROP CONSTRAINT "sql_statements_executed_by_profiles_id_fk";
--> statement-breakpoint
ALTER TABLE "sql_statements" ADD CONSTRAINT "sql_statements_executed_by_profiles_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;