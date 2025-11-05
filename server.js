const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");

const rawAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [];

const allowAllOrigins = rawAllowedOrigins.includes("*");
const allowedOrigins = rawAllowedOrigins.filter((origin) => origin !== "*");

const escapeRegExp = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesAllowedOrigin = (origin) =>
  allowedOrigins.some((allowedOrigin) => {
    if (!allowedOrigin.includes("*")) {
      return allowedOrigin === origin;
    }
    const pattern = allowedOrigin
      .split("*")
      .map(escapeRegExp)
      .join(".*");
    return new RegExp(`^${pattern}$`).test(origin);
  });

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (
      allowAllOrigins ||
      !allowedOrigins.length ||
      matchesAllowedOrigin(origin)
    ) {
      return callback(null, true);
    }
    console.warn(`[cors] blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With",
  ],
  optionsSuccessStatus: 204,
  preflightContinue: false,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

const adminRoutes = require("./routes/admin.route");
const employeeRoutes = require("./routes/employee.route");
const userRoutes = require("./routes/user.route");
const roleRoutes = require("./routes/role.route");
const userAuthRoutes = require("./routes/user.auth.route");
const terminateRoute = require("./routes/terminate.route");
const uploadRoute = require("./routes/upload.route");
const photoIdRoute = require("./routes/photoIdType.routes");
const loanRoute = require("./routes/loan.route");
const loanTypeRoute = require("./routes/loanType.routes");
const stateRoute = require("./routes/state.routes");
const cityRoute = require("./routes/city.routes");
const regionRoute = require("./routes/region.routes");
const listRoutes = require("./routes/list.route");
const reportRoutes = require("./routes/report.route");
const auditRoutes = require("./routes/audit.route");
const dashboardRoutes = require("./routes/dashboard.route");

app.use(express.json());
app.get("/", async (req, res) => {
  try {
    res.json({ status: 200, data: process.env.COMPANY_NAME?.toLowerCase() });
  } catch (error) {
    return res.status(500).json({
      error: "Internal server error",
      message: error.message,
      status: 500,
    });
  }
});

app.get("/api/status", (req, res) => {
  res.json({ status: 200, data: "Server is running!" });
});

app.use("/api/admin", adminRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/list", listRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/user-auth", userAuthRoutes);
app.use("/api/terminate", terminateRoute);
app.use("/api/file", uploadRoute);
app.use("/api/photoId", photoIdRoute);
app.use("/api/loan", loanRoute);
app.use("/api/loanType", loanTypeRoute);
app.use("/api/state", stateRoute);
app.use("/api/city", cityRoute);
app.use("/api/region", regionRoute);
app.use("/api/report", reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);

const PORT = process.env.PORT || 3001;

if (!process.env.VERCEL) {
  app.listen(PORT, () =>
    console.log(`🚀 Servers running on http://localhost:${PORT}`)
  );
}

module.exports = app;
