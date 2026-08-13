module.exports = {
  apps: [
    {
      name: "merli360",
      cwd: "/opt/novo-saas",
      script: "node_modules/next/dist/bin/next",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        BASIC_AUTH_ENABLED: "true"
      }
    }
  ]
};
