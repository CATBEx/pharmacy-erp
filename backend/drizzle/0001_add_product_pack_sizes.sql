ALTER TABLE "products" ADD COLUMN "pieces_per_strip" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "strips_per_box" integer DEFAULT 1 NOT NULL;