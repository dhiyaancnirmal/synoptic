CREATE TABLE IF NOT EXISTS "stream_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_number" integer NOT NULL,
	"block_hash" text,
	"parent_hash" text,
	"timestamp" integer,
	"transaction_count" integer DEFAULT 0 NOT NULL,
	"gas_used" text,
	"gas_limit" text,
	"raw_payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "derived_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"block_number" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer DEFAULT 0 NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"token_address" text NOT NULL,
	"amount" text,
	"token_symbol" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "derived_contract_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_address" text NOT NULL,
	"block_start" integer NOT NULL,
	"block_end" integer NOT NULL,
	"tx_count" integer DEFAULT 0 NOT NULL,
	"unique_callers" integer DEFAULT 0 NOT NULL,
	"failed_tx_count" integer DEFAULT 0 NOT NULL,
	"total_gas_used" text,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplace_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid,
	"sku" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"payment_id" uuid,
	"status" text NOT NULL,
	"result_hash" text,
	"result_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_stream_blocks_number" ON "stream_blocks" USING btree ("block_number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stream_blocks_received" ON "stream_blocks" USING btree ("received_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_derived_transfers_tx_log" ON "derived_transfers" USING btree ("tx_hash","log_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_derived_transfers_block" ON "derived_transfers" USING btree ("block_number");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_derived_contract_block" ON "derived_contract_activity" USING btree ("contract_address","block_start","block_end");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_derived_contract_address" ON "derived_contract_activity" USING btree ("contract_address");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchases_agent_id" ON "marketplace_purchases" USING btree ("agent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_purchases_sku" ON "marketplace_purchases" USING btree ("sku");
--> statement-breakpoint
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
