-- Support fast circular reports and recipient read-status summaries.

create index if not exists circular_recipients_circular_status_idx
  on public.circular_recipients (circular_id, read_at, acknowledged_at);

create index if not exists administrative_circulars_school_publish_idx
  on public.administrative_circulars (school_id, publish_date desc, expiry_date desc);
