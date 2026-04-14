module.exports = {
  apps: [{
    name: 'smashlab',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 3002',
    cwd: '/var/www/smashlab',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
    },
    error_file: '/var/log/pm2/smashlab-error.log',
    out_file: '/var/log/pm2/smashlab-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
}
