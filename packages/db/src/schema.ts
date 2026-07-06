export const migrations = [
  {
    id: "001_enable_vector",
    sql: `
      create extension if not exists vector;
    `,
  },
  {
    id: "002_core_tables",
    sql: `
      create table if not exists users (
        id uuid primary key default gen_random_uuid(),
        email text unique,
        display_name text,
        created_at timestamptz not null default now()
      );

      create table if not exists ai_agents (
        id uuid primary key default gen_random_uuid(),
        name text not null unique,
        source text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists ai_sessions (
        id uuid primary key default gen_random_uuid(),
        agent_id uuid references ai_agents(id),
        source_type text not null,
        source_path text,
        title text not null,
        started_at timestamptz,
        ended_at timestamptz,
        raw_stored boolean not null default false,
        created_at timestamptz not null default now()
      );

      create table if not exists ai_messages (
        id uuid primary key default gen_random_uuid(),
        session_id uuid not null references ai_sessions(id) on delete cascade,
        role text not null,
        content text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists ai_session_summaries (
        id uuid primary key default gen_random_uuid(),
        session_id uuid not null references ai_sessions(id) on delete cascade,
        summary text not null,
        redaction_status text not null,
        skill_tags text[] not null default '{}',
        created_at timestamptz not null default now()
      );

      create table if not exists memory_items (
        id uuid primary key default gen_random_uuid(),
        source text not null,
        source_id text,
        title text not null,
        summary text not null,
        sensitivity text not null default 'redacted',
        metadata jsonb not null default '{}',
        created_at timestamptz not null default now()
      );

      create table if not exists github_repos (
        id bigint primary key,
        owner text not null,
        name text not null,
        full_name text not null unique,
        private boolean not null default false,
        default_branch text,
        html_url text,
        language text,
        pushed_at timestamptz,
        updated_at timestamptz,
        synced_at timestamptz not null default now()
      );

      create table if not exists github_pull_requests (
        id bigint primary key,
        repo_id bigint references github_repos(id),
        number integer not null,
        title text not null,
        state text not null,
        head_sha text,
        html_url text,
        merged_at timestamptz,
        updated_at timestamptz,
        synced_at timestamptz not null default now()
      );

      create table if not exists github_pr_files (
        pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
        filename text not null,
        status text not null,
        additions integer not null default 0,
        deletions integer not null default 0,
        changes integer not null default 0,
        previous_filename text,
        synced_at timestamptz not null default now(),
        primary key (pull_request_id, filename)
      );

      create table if not exists github_pr_reviews (
        id bigint primary key,
        pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
        reviewer_login text,
        state text not null,
        html_url text,
        submitted_at timestamptz,
        comment_count integer not null default 0,
        synced_at timestamptz not null default now()
      );

      create table if not exists github_pr_checks (
        id bigint primary key,
        pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
        head_sha text not null,
        name text not null,
        status text not null,
        conclusion text,
        details_url text,
        app_slug text,
        started_at timestamptz,
        completed_at timestamptz,
        synced_at timestamptz not null default now()
      );

      create index if not exists github_pr_checks_pull_request_head_idx
        on github_pr_checks (pull_request_id, head_sha);

      create table if not exists github_commits (
        repo_id bigint not null references github_repos(id) on delete cascade,
        sha text not null,
        message text not null,
        author_login text,
        html_url text,
        committed_at timestamptz,
        branch text,
        synced_at timestamptz not null default now(),
        primary key (repo_id, sha)
      );

      create table if not exists github_repo_profiles (
        repo_id bigint primary key references github_repos(id) on delete cascade,
        scan_status text not null default 'scanned'
          check (scan_status in ('scanned', 'unavailable')),
        scan_error text,
        has_readme boolean,
        has_tests boolean,
        has_deployment_config boolean,
        has_architecture_diagram boolean,
        tech_stack text[] not null default '{}',
        evidence_paths text[] not null default '{}',
        scanned_at timestamptz not null,
        synced_at timestamptz not null default now()
      );

      create table if not exists linear_workspaces (
        id text primary key,
        name text not null,
        url_key text,
        synced_at timestamptz not null default now()
      );

      create table if not exists linear_teams (
        id text primary key,
        workspace_id text references linear_workspaces(id),
        name text not null,
        key text,
        synced_at timestamptz not null default now()
      );

      create table if not exists linear_projects (
        id text primary key,
        team_id text references linear_teams(id),
        name text not null,
        state text,
        progress numeric,
        url text,
        synced_at timestamptz not null default now()
      );

      create table if not exists linear_issues (
        id text primary key,
        project_id text references linear_projects(id),
        team_id text references linear_teams(id),
        identifier text not null,
        title text not null,
        state text,
        priority integer,
        assignee text,
        url text,
        updated_at timestamptz,
        synced_at timestamptz not null default now()
      );

      create table if not exists scores (
        id uuid primary key default gen_random_uuid(),
        kind text not null,
        value numeric not null,
        explanation text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists score_snapshots (
        id uuid primary key default gen_random_uuid(),
        overall numeric not null,
        breakdown jsonb not null,
        rubric_version text not null,
        created_at timestamptz not null default now()
      );

      create table if not exists daily_plans (
        id uuid primary key default gen_random_uuid(),
        plan_date date not null unique,
        tasks jsonb not null,
        target_minutes integer not null,
        created_at timestamptz not null default now()
      );

      create table if not exists daily_tasks (
        id uuid primary key default gen_random_uuid(),
        plan_date date not null,
        task_key text not null,
        category text not null,
        title text not null,
        minutes integer not null,
        evidence text,
        status text not null default 'pending'
          check (status in ('pending', 'completed', 'skipped')),
        completed_at timestamptz,
        notes text,
        evidence_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (plan_date, task_key)
      );

      create index if not exists daily_tasks_plan_date_idx
        on daily_tasks (plan_date desc);

      create index if not exists daily_tasks_status_idx
        on daily_tasks (status);

      create table if not exists weekly_plans (
        id uuid primary key default gen_random_uuid(),
        week_start date not null unique,
        weekly_goal text not null,
        tasks jsonb not null,
        target_minutes integer not null,
        generated_at timestamptz not null,
        created_at timestamptz not null default now()
      );

      create index if not exists weekly_plans_week_start_idx
        on weekly_plans (week_start desc);

      create table if not exists content_drafts (
        id uuid primary key default gen_random_uuid(),
        draft_key text not null unique,
        draft_type text not null
          check (draft_type in (
            'resume_bullet',
            'linkedin_post',
            'x_post',
            'portfolio_description',
            'interview_talking_point',
            'weekly_progress_summary'
          )),
        title text not null,
        body text not null,
        evidence jsonb not null,
        metadata jsonb not null default '{}',
        generated_at timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists content_drafts_type_generated_idx
        on content_drafts (draft_type, generated_at desc);

      create table if not exists slack_notifications (
        id uuid primary key default gen_random_uuid(),
        delivery_key text,
        channel text,
        text text not null,
        status text not null default 'pending'
          check (status in ('pending', 'delivered', 'failed')),
        claimed_at timestamptz not null default now(),
        delivered_at timestamptz,
        response jsonb,
        created_at timestamptz not null default now()
      );

      create unique index if not exists slack_notifications_delivery_key_unique
        on slack_notifications (delivery_key)
        where delivery_key is not null;

      create table if not exists ingestion_runs (
        id uuid primary key default gen_random_uuid(),
        source text not null,
        status text not null,
        summary text,
        error text,
        started_at timestamptz not null default now(),
        finished_at timestamptz
      );
    `,
  },
  {
    id: "003_vector_tables",
    sql: `
      create table if not exists memory_embeddings (
        id uuid primary key default gen_random_uuid(),
        memory_item_id uuid not null references memory_items(id) on delete cascade,
        embedding vector(1536),
        model text not null,
        created_at timestamptz not null default now()
      );
    `,
  },
  {
    id: "004_memory_item_source_index",
    sql: `
      create unique index if not exists memory_items_source_source_id_unique
        on memory_items (source, source_id)
        where source_id is not null;
    `,
  },
  {
    id: "005_memory_embeddings_unique_item_model",
    sql: `
      create unique index if not exists memory_embeddings_item_model_unique
        on memory_embeddings (memory_item_id, model);
    `,
  },
  {
    id: "006_ai_sessions_source_identity",
    sql: `
      alter table ai_sessions
        add column if not exists source_id text;

      create unique index if not exists ai_sessions_source_type_source_id_unique
        on ai_sessions (source_type, source_id)
        where source_id is not null;
    `,
  },
  {
    id: "007_github_commits",
    sql: `
      create table if not exists github_commits (
        repo_id bigint not null references github_repos(id) on delete cascade,
        sha text not null,
        message text not null,
        author_login text,
        html_url text,
        committed_at timestamptz,
        branch text,
        synced_at timestamptz not null default now(),
        primary key (repo_id, sha)
      );

      create index if not exists github_commits_repo_committed_at_idx
        on github_commits (repo_id, committed_at desc);
    `,
  },
  {
    id: "008_webhook_events",
    sql: `
      create table if not exists github_webhook_events (
        delivery_id text primary key,
        event text not null,
        action text,
        status text not null default 'processing'
          check (status in ('processing', 'processed', 'failed')),
        error text,
        received_at timestamptz not null default now(),
        processed_at timestamptz
      );

      create index if not exists github_webhook_events_received_at_idx
        on github_webhook_events (received_at desc);

      create table if not exists linear_webhook_events (
        delivery_id text primary key,
        event_type text,
        action text,
        webhook_timestamp timestamptz,
        status text not null default 'processing'
          check (status in ('processing', 'processed', 'failed')),
        error text,
        received_at timestamptz not null default now(),
        processed_at timestamptz
      );

      create index if not exists linear_webhook_events_received_at_idx
        on linear_webhook_events (received_at desc);
    `,
  },
  {
    id: "009_github_repo_profiles",
    sql: `
      create table if not exists github_repo_profiles (
        repo_id bigint primary key references github_repos(id) on delete cascade,
        scan_status text not null default 'scanned'
          check (scan_status in ('scanned', 'unavailable')),
        scan_error text,
        has_readme boolean,
        has_tests boolean,
        has_deployment_config boolean,
        has_architecture_diagram boolean,
        tech_stack text[] not null default '{}',
        evidence_paths text[] not null default '{}',
        scanned_at timestamptz not null,
        synced_at timestamptz not null default now()
      );

      create index if not exists github_repo_profiles_scan_status_idx
        on github_repo_profiles (scan_status);
    `,
  },
  {
    id: "010_github_pr_metadata",
    sql: `
      create table if not exists github_pr_files (
        pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
        filename text not null,
        status text not null,
        additions integer not null default 0,
        deletions integer not null default 0,
        changes integer not null default 0,
        previous_filename text,
        synced_at timestamptz not null default now(),
        primary key (pull_request_id, filename)
      );

      create index if not exists github_pr_files_pull_request_idx
        on github_pr_files (pull_request_id);

      create table if not exists github_pr_reviews (
        id bigint primary key,
        pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
        reviewer_login text,
        state text not null,
        html_url text,
        submitted_at timestamptz,
        comment_count integer not null default 0,
        synced_at timestamptz not null default now()
      );

      create index if not exists github_pr_reviews_pull_request_idx
        on github_pr_reviews (pull_request_id);
    `,
  },
  {
    id: "011_learning_plan_tracking",
    sql: `
      create table if not exists daily_tasks (
        id uuid primary key default gen_random_uuid(),
        plan_date date not null,
        task_key text not null,
        category text not null,
        title text not null,
        minutes integer not null,
        evidence text,
        status text not null default 'pending'
          check (status in ('pending', 'completed', 'skipped')),
        completed_at timestamptz,
        notes text,
        evidence_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (plan_date, task_key)
      );

      create index if not exists daily_tasks_plan_date_idx
        on daily_tasks (plan_date desc);

      create index if not exists daily_tasks_status_idx
        on daily_tasks (status);

      create table if not exists weekly_plans (
        id uuid primary key default gen_random_uuid(),
        week_start date not null unique,
        weekly_goal text not null,
        tasks jsonb not null,
        target_minutes integer not null,
        generated_at timestamptz not null,
        created_at timestamptz not null default now()
      );

      create index if not exists weekly_plans_week_start_idx
        on weekly_plans (week_start desc);
    `,
  },
  {
    id: "012_content_drafts",
    sql: `
      create table if not exists content_drafts (
        id uuid primary key default gen_random_uuid(),
        draft_key text not null unique,
        draft_type text not null
          check (draft_type in (
            'resume_bullet',
            'linkedin_post',
            'x_post',
            'portfolio_description',
            'interview_talking_point',
            'weekly_progress_summary'
          )),
        title text not null,
        body text not null,
        evidence jsonb not null,
        metadata jsonb not null default '{}',
        generated_at timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists content_drafts_type_generated_idx
        on content_drafts (draft_type, generated_at desc);
    `,
  },
  {
    id: "013_slack_delivery_idempotency",
    sql: `
      alter table slack_notifications
        add column if not exists delivery_key text,
        add column if not exists status text,
        add column if not exists claimed_at timestamptz;

      update slack_notifications
      set
        status = case when delivered_at is null then 'failed' else 'delivered' end,
        claimed_at = coalesce(claimed_at, created_at, now())
      where status is null or claimed_at is null;

      alter table slack_notifications
        alter column status set default 'pending',
        alter column status set not null,
        alter column claimed_at set default now(),
        alter column claimed_at set not null;

      do $$
      begin
        if not exists (
          select 1
          from pg_constraint
          where conname = 'slack_notifications_status_check'
        ) then
          alter table slack_notifications
            add constraint slack_notifications_status_check
            check (status in ('pending', 'delivered', 'failed'));
        end if;
      end
      $$;

      create unique index if not exists slack_notifications_delivery_key_unique
        on slack_notifications (delivery_key)
        where delivery_key is not null;
    `,
  },
  {
    id: "014_distributed_api_rate_limits",
    sql: `
      create table if not exists api_rate_limit_buckets (
        bucket_key text primary key,
        request_count integer not null,
        reset_at timestamptz not null,
        updated_at timestamptz not null default now()
      );

      create index if not exists api_rate_limit_buckets_reset_at_idx
        on api_rate_limit_buckets (reset_at);
    `,
  },
  {
    id: "015_score_snapshot_rubric_version",
    sql: `
      alter table score_snapshots
        add column if not exists rubric_version text;

      update score_snapshots
      set rubric_version = 'legacy-v0'
      where rubric_version is null;

      alter table score_snapshots
        alter column rubric_version set not null;
    `,
  },
  {
    id: "016_github_pr_checks",
    sql: `
      alter table github_pull_requests
        add column if not exists head_sha text;

      create table if not exists github_pr_checks (
        id bigint primary key,
        pull_request_id bigint not null references github_pull_requests(id) on delete cascade,
        head_sha text not null,
        name text not null,
        status text not null,
        conclusion text,
        details_url text,
        app_slug text,
        started_at timestamptz,
        completed_at timestamptz,
        synced_at timestamptz not null default now()
      );

      create index if not exists github_pr_checks_pull_request_idx
        on github_pr_checks (pull_request_id);

      create index if not exists github_pr_checks_pull_request_head_idx
        on github_pr_checks (pull_request_id, head_sha);
    `,
  },
  {
    id: "017_skills_and_skill_evidence",
    sql: `
      create table if not exists skills (
        id uuid primary key default gen_random_uuid(),
        slug text not null unique,
        name text not null,
        category text,
        created_at timestamptz not null default now()
      );

      create table if not exists skill_evidence (
        id uuid primary key default gen_random_uuid(),
        skill_id uuid not null references skills(id) on delete cascade,
        source text not null,
        source_id text not null,
        title text not null,
        summary text not null,
        occurred_at timestamptz,
        created_at timestamptz not null default now()
      );

      create unique index if not exists skill_evidence_skill_source_unique
        on skill_evidence (skill_id, source, source_id);

      create index if not exists skill_evidence_source_idx
        on skill_evidence (source, source_id);
    `,
  },
];
