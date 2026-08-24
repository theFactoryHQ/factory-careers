ALTER TABLE "document_erasure_queue" ADD CONSTRAINT "document_erasure_queue_result_code_check" CHECK (
    "document_erasure_queue"."result_code" IS NULL OR "document_erasure_queue"."result_code" IN (
      'erased',
      'object_absent',
      'storage_timeout',
      'storage_throttled',
      'storage_access_denied',
      'storage_unavailable',
      'storage_error',
      'lease_expired'
    )
  );