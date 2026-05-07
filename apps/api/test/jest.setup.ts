process.env.DATABASE_URL ??=
  'postgresql://lilink:lilink@127.0.0.1:5432/lilink?schema=public';
process.env.JWT_SECRET ??= '1234567890abcdef';
process.env.ADMIN_JWT_SECRET ??= 'abcdef1234567890';
process.env.ADMIN_COOKIE_NAME ??= 'lilink_admin_token';
process.env.SMTP_FROM ??= 'LiLink <hello@lilink.zone>';
process.env.CRON_SECRET ??= 'abcdef1234567890';
