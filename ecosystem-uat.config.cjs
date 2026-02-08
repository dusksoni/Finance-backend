module.exports = {
  apps: [
    {
      name: "kushalfinance-uat",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "staging",
        PORT: 3002
      },
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      time: true
    }
  ]
};
