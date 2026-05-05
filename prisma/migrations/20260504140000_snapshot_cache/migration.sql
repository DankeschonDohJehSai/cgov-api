-- CreateTable
CREATE TABLE "snapshot_cache" (
  "cache_key" TEXT NOT NULL,
  "body" BYTEA NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL,
  "schema_version" TEXT NOT NULL,
  "is_final" BOOLEAN NOT NULL DEFAULT false,
  "byte_size" INTEGER NOT NULL,
  "etag" TEXT NOT NULL,
  "last_accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "snapshot_cache_pkey" PRIMARY KEY ("cache_key")
);

-- CreateIndex
CREATE INDEX "snapshot_cache_last_accessed_at_idx" ON "snapshot_cache"("last_accessed_at");
