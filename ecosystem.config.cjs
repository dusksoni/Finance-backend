module.exports = {
  apps: [
    // 🔵 PROD BACKEND
    {
      name: "kushal-finance-backend",
      script: "server.js",
      cwd: "/home/ubuntu/kushal-finance-backend",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
    },

    // 🟡 STAGING / UAT BACKEND
    {
      name: "kushal-finance-backend-uat",
      script: "server.js",
      cwd: "/home/ubuntu/kushal-finance-backend-uat",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "staging",
        PORT: 3002,
      },
    },
  ],
};
