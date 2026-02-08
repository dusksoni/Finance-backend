module.exports = {
  apps: [
    {
      name: "kushal-finance-backend",
      script: "server.js",
      env: {
        NODE_ENV: "production",
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
  ],
};
