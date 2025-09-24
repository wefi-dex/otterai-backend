module.exports = {
  apps: [
    {
      name: 'otterai-backend',
      script: 'src/server.js',
      cwd: '/opt/otterai/otterai-backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_file: '/opt/otterai/logs/backend.log',
      out_file: '/opt/otterai/logs/backend-out.log',
      error_file: '/opt/otterai/logs/backend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=1024',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },
    {
      name: 'otterai-frontend',
      script: 'npm',
      args: 'run preview',
      cwd: '/opt/otterai/otterai-admin-frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000
      },
      log_file: '/opt/otterai/logs/frontend.log',
      out_file: '/opt/otterai/logs/frontend-out.log',
      error_file: '/opt/otterai/logs/frontend-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '512M',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'dist'],
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ],

  deploy: {
    production: {
      user: 'otterai',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:your-username/otterai.git',
      path: '/opt/otterai',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};

