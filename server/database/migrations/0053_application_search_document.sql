CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "application_search_document" (
  "application_id" text PRIMARY KEY NOT NULL REFERENCES "application"("id") ON DELETE cascade,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "job_id" text NOT NULL REFERENCES "job"("id") ON DELETE cascade,
  "candidate_id" text NOT NULL REFERENCES "candidate"("id") ON DELETE cascade,
  "search_text" text NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "application_search_document_org_idx"
  ON "application_search_document" USING btree ("organization_id");
CREATE INDEX "application_search_document_job_idx"
  ON "application_search_document" USING btree ("job_id");
CREATE INDEX "application_search_document_candidate_idx"
  ON "application_search_document" USING btree ("candidate_id");

-- Rebuild one application's denormalized recruiter-search document. Voluntary
-- compliance/self-identification responses are deliberately not included.
CREATE OR REPLACE FUNCTION refresh_application_search_document(target_application_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO application_search_document (
    application_id,
    organization_id,
    job_id,
    candidate_id,
    search_text,
    updated_at
  )
  SELECT
    a.id,
    a.organization_id,
    a.job_id,
    a.candidate_id,
    btrim(concat_ws(' ',
      a.id, a.organization_id, a.candidate_id, a.job_id, a.status, a.score,
      a.notes, a.cover_letter_text, a.created_at, a.updated_at,
      c.id, c.first_name, c.last_name, c.display_name, c.email, c.phone,
      c.country, c.state, c.date_of_birth, c.gender, c.quick_notes,
      c.created_at, c.updated_at,
      j.id, j.title, j.slug,
      (
        SELECT string_agg(concat_ws(' ',
          d.id, d.type, d.original_filename, d.mime_type, d.size_bytes,
          d.parsed_content::text, d.created_at
        ), ' ')
        FROM document d
        WHERE d.organization_id = a.organization_id
          AND d.candidate_id = a.candidate_id
      ),
      (
        SELECT string_agg(concat_ws(' ',
          qr.id, jq.id, jq.type, jq.label, jq.description, jq.options::text,
          qr.value::text, qr.created_at
        ), ' ')
        FROM question_response qr
        INNER JOIN job_question jq
          ON jq.id = qr.question_id
          AND jq.organization_id = a.organization_id
        WHERE qr.organization_id = a.organization_id
          AND qr.application_id = a.id
      ),
      (
        SELECT string_agg(concat_ws(' ',
          pv.id, pd.id, pd.job_id, pd.entity_type, pd.type, pd.name,
          pd.description, pd.config::text, pv.value::text,
          pv.created_at, pv.updated_at
        ), ' ')
        FROM property_value pv
        INNER JOIN property_definition pd
          ON pd.id = pv.property_definition_id
          AND pd.organization_id = a.organization_id
        WHERE pv.organization_id = a.organization_id
          AND (
            (pv.entity_type = 'application' AND pv.entity_id = a.id)
            OR (pv.entity_type = 'candidate' AND pv.entity_id = a.candidate_id)
          )
      ),
      (
        SELECT string_agg(concat_ws(' ',
          i.id, i.title, i.type, i.status, i.scheduled_at, i.duration,
          i.location, i.notes, i.interviewers::text, i.invitation_sent_at,
          i.candidate_response, i.candidate_responded_at,
          i.calendar_event_provider, i.google_calendar_event_id,
          i.google_calendar_event_link, i.timezone, i.created_at, i.updated_at
        ), ' ')
        FROM interview i
        WHERE i.organization_id = a.organization_id
          AND i.application_id = a.id
      ),
      (
        SELECT string_agg(concat_ws(' ', cm.id, cm.body, cm.created_at, cm.updated_at), ' ')
        FROM comment cm
        WHERE cm.organization_id = a.organization_id
          AND (
            (cm.target_type = 'application' AND cm.target_id = a.id)
            OR (cm.target_type = 'candidate' AND cm.target_id = a.candidate_id)
          )
      ),
      (
        SELECT string_agg(concat_ws(' ',
          cs.id, cs.criterion_key, sc.name, sc.description, sc.category,
          sc.max_score, sc.weight, cs.max_score, cs.applicant_score,
          cs.confidence, cs.evidence, cs.strengths::text, cs.gaps::text,
          cs.created_at
        ), ' ')
        FROM criterion_score cs
        LEFT JOIN scoring_criterion sc
          ON sc.organization_id = a.organization_id
          AND sc.job_id = a.job_id
          AND sc.key = cs.criterion_key
        WHERE cs.organization_id = a.organization_id
          AND cs.application_id = a.id
      ),
      (
        SELECT string_agg(concat_ws(' ',
          ar.id, ar.status, ar.provider, ar.model, ar.criteria_snapshot::text,
          ar.composite_score, ar.raw_response::text, ar.error_message, ar.created_at
        ), ' ')
        FROM analysis_run ar
        WHERE ar.organization_id = a.organization_id
          AND ar.application_id = a.id
      ),
      (
        SELECT string_agg(concat_ws(' ',
          arcs.id, arcs.criterion_key, arcs.max_score, arcs.applicant_score,
          arcs.confidence, arcs.evidence, arcs.strengths::text,
          arcs.gaps::text, arcs.created_at
        ), ' ')
        FROM analysis_run_criterion_score arcs
        WHERE arcs.organization_id = a.organization_id
          AND arcs.application_id = a.id
      ),
      (
        SELECT string_agg(concat_ws(' ',
          arf.id, arf.sentiment, arf.comment, arf.created_at
        ), ' ')
        FROM analysis_run_feedback arf
        WHERE arf.organization_id = a.organization_id
          AND arf.application_id = a.id
      ),
      (
        SELECT string_agg(concat_ws(' ',
          aps.id, aps.channel, aps.utm_source, aps.utm_medium,
          aps.utm_campaign, aps.utm_term, aps.utm_content,
          aps.referrer_domain, aps.created_at, tl.id, tl.job_id, tl.channel,
          tl.name, tl.code, tl.utm_source, tl.utm_medium, tl.utm_campaign,
          tl.utm_term, tl.utm_content
        ), ' ')
        FROM application_source aps
        LEFT JOIN tracking_link tl
          ON tl.id = aps.tracking_link_id
          AND tl.organization_id = a.organization_id
        WHERE aps.organization_id = a.organization_id
          AND aps.application_id = a.id
      )
    )),
    now()
  FROM application a
  INNER JOIN candidate c
    ON c.id = a.candidate_id
    AND c.organization_id = a.organization_id
  INNER JOIN job j
    ON j.id = a.job_id
    AND j.organization_id = a.organization_id
  WHERE a.id = target_application_id
  ON CONFLICT (application_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    job_id = EXCLUDED.job_id,
    candidate_id = EXCLUDED.candidate_id,
    search_text = EXCLUDED.search_text,
    updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_application_search_for_candidate(target_candidate_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_id text;
BEGIN
  FOR target_id IN
    SELECT id FROM application WHERE candidate_id = target_candidate_id
  LOOP
    PERFORM refresh_application_search_document(target_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_application_search_for_job(target_job_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_id text;
BEGIN
  FOR target_id IN
    SELECT id FROM application WHERE job_id = target_job_id
  LOOP
    PERFORM refresh_application_search_document(target_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_application_search_for_entity(
  target_entity_type text,
  target_entity_id text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF target_entity_type = 'application' THEN
    PERFORM refresh_application_search_document(target_entity_id);
  ELSIF target_entity_type = 'candidate' THEN
    PERFORM refresh_application_search_for_candidate(target_entity_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_application_search_for_property_definition(target_definition_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  property_record record;
BEGIN
  FOR property_record IN
    SELECT DISTINCT entity_type::text AS entity_type, entity_id
    FROM property_value
    WHERE property_definition_id = target_definition_id
  LOOP
    PERFORM refresh_application_search_for_entity(property_record.entity_type, property_record.entity_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_application_search_for_tracking_link(target_tracking_link_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  target_id text;
BEGIN
  FOR target_id IN
    SELECT application_id
    FROM application_source
    WHERE tracking_link_id = target_tracking_link_id
  LOOP
    PERFORM refresh_application_search_document(target_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION application_search_refresh_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'application' THEN
    IF TG_OP <> 'DELETE' THEN
      PERFORM refresh_application_search_document(NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'candidate' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_for_candidate(OLD.id);
    END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id) THEN
      PERFORM refresh_application_search_for_candidate(NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'document' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_for_candidate(OLD.candidate_id);
    END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW.candidate_id IS DISTINCT FROM OLD.candidate_id) THEN
      PERFORM refresh_application_search_for_candidate(NEW.candidate_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'job' THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM refresh_application_search_for_job(OLD.id);
    ELSE
      PERFORM refresh_application_search_for_job(NEW.id);
      IF TG_OP = 'UPDATE' AND NEW.id IS DISTINCT FROM OLD.id THEN
        PERFORM refresh_application_search_for_job(OLD.id);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('job_question', 'scoring_criterion') THEN
    IF TG_OP = 'DELETE' THEN
      PERFORM refresh_application_search_for_job(OLD.job_id);
    ELSE
      PERFORM refresh_application_search_for_job(NEW.job_id);
      IF TG_OP = 'UPDATE' AND NEW.job_id IS DISTINCT FROM OLD.job_id THEN
        PERFORM refresh_application_search_for_job(OLD.job_id);
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN (
    'question_response', 'interview', 'criterion_score',
    'analysis_run', 'analysis_run_criterion_score', 'analysis_run_feedback',
    'application_source'
  ) THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_document(OLD.application_id);
    END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW.application_id IS DISTINCT FROM OLD.application_id) THEN
      PERFORM refresh_application_search_document(NEW.application_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'comment' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_for_entity(OLD.target_type::text, OLD.target_id);
    END IF;
    IF TG_OP <> 'DELETE' AND (
      TG_OP <> 'UPDATE'
      OR NEW.target_type IS DISTINCT FROM OLD.target_type
      OR NEW.target_id IS DISTINCT FROM OLD.target_id
    ) THEN
      PERFORM refresh_application_search_for_entity(NEW.target_type::text, NEW.target_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'property_value' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_for_entity(OLD.entity_type::text, OLD.entity_id);
    END IF;
    IF TG_OP <> 'DELETE' AND (
      TG_OP <> 'UPDATE'
      OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
      OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
    ) THEN
      PERFORM refresh_application_search_for_entity(NEW.entity_type::text, NEW.entity_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'property_definition' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_for_property_definition(OLD.id);
    END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id) THEN
      PERFORM refresh_application_search_for_property_definition(NEW.id);
    END IF;
  ELSIF TG_TABLE_NAME = 'tracking_link' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM refresh_application_search_for_tracking_link(OLD.id);
    END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP <> 'UPDATE' OR NEW.id IS DISTINCT FROM OLD.id) THEN
      PERFORM refresh_application_search_for_tracking_link(NEW.id);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER application_search_application_changed
  AFTER INSERT OR UPDATE OR DELETE ON application
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_candidate_changed
  AFTER INSERT OR UPDATE OR DELETE ON candidate
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_document_changed
  AFTER INSERT OR UPDATE OR DELETE ON document
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_job_changed
  AFTER INSERT OR UPDATE OR DELETE ON job
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_job_question_changed
  AFTER INSERT OR UPDATE OR DELETE ON job_question
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_question_response_changed
  AFTER INSERT OR UPDATE OR DELETE ON question_response
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_property_definition_changed
  AFTER INSERT OR UPDATE OR DELETE ON property_definition
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_property_value_changed
  AFTER INSERT OR UPDATE OR DELETE ON property_value
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_interview_changed
  AFTER INSERT OR UPDATE OR DELETE ON interview
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_comment_changed
  AFTER INSERT OR UPDATE OR DELETE ON comment
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_scoring_criterion_changed
  AFTER INSERT OR UPDATE OR DELETE ON scoring_criterion
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_criterion_score_changed
  AFTER INSERT OR UPDATE OR DELETE ON criterion_score
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_analysis_run_changed
  AFTER INSERT OR UPDATE OR DELETE ON analysis_run
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_analysis_run_criterion_changed
  AFTER INSERT OR UPDATE OR DELETE ON analysis_run_criterion_score
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_analysis_feedback_changed
  AFTER INSERT OR UPDATE OR DELETE ON analysis_run_feedback
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_application_source_changed
  AFTER INSERT OR UPDATE OR DELETE ON application_source
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();
CREATE TRIGGER application_search_tracking_link_changed
  AFTER INSERT OR UPDATE OR DELETE ON tracking_link
  FOR EACH ROW EXECUTE FUNCTION application_search_refresh_trigger();

-- Backfill before creating the larger GIN index so existing deployments migrate
-- in one pass without maintaining the index row-by-row.
SELECT refresh_application_search_document(id) FROM application;

CREATE INDEX "application_search_document_text_trgm_idx"
  ON "application_search_document" USING gin ("search_text" gin_trgm_ops);
