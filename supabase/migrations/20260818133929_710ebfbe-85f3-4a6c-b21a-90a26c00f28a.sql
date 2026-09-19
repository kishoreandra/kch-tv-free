SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'evaluate-price-alerts-intraday';

SELECT cron.schedule(
  'evaluate-price-alerts-intraday',
  '*/15 3-11 * * 1-5',
  $$SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/evaluate-alerts',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret','1sk0BRVRa9Yjs6lHDwnhjRoKazzYN01Eu5zICTWRtwFFKHbF'),
      body:='{}'::jsonb);$$
);