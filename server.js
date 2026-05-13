const express = require("express");
require("dotenv").config();

// ─── Environment validation — crash early with clear message ───────────────
const REQUIRED_ENV = ["DATABASE_URL", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const app = express();
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const { initializeCronJobs, updateAllOverdueFines } = require("./utils/fineUpdateService");

// ─── Route imports ─────────────────────────────────────────────────────────
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
const loanApplicationRoute = require("./routes/loanApplication.route");
const userApplicationRoute = require("./routes/userApplication.route");
const stateRoute = require("./routes/state.routes");
const cityRoute = require("./routes/city.routes");
const regionRoute = require("./routes/region.routes");
const listRoutes = require("./routes/list.route");
const reportRoutes = require("./routes/report.route");
const auditRoutes = require("./routes/audit.route");
const dashboardRoutes = require("./routes/dashboard.route");
const publicUserRoutes = require("./routes/publicUser.route");
const iciciPaymentRoutes = require("./routes/iciciPayment.route");
const seizedRoutes = require("./routes/seized.route");
const bulkUploadRoutes = require("./routes/bulkUpload.route");
const otpRoutes = require("./routes/otp.route");
const appConfigRoutes = require("./routes/appConfig.route");
const grievanceRoutes = require("./routes/grievance.route");
const collectionRoutes = require("./routes/collection.route");
const approvalMatrixRoutes = require("./routes/approvalMatrix.route");
const kycRoutes = require("./routes/kyc.route");
const consentRoutes = require("./routes/consent.route");
const restructuringRoutes = require("./routes/restructuring.route");
const reconciliationRoutes = require("./routes/reconciliation.route");
const collectionEnhancedRoutes = require("./routes/collectionEnhanced.route");
const collateralRoutes = require("./routes/collateral.route");
const partnerRoutes = require("./routes/partner.route");
const savedReportRoutes = require("./routes/savedReport.route");
const automationRoutes = require("./routes/automation.route");
const complianceRoutes = require("./routes/compliance.route");
const nachRoutes = require("./routes/nach.route");
const bounceRoutes = require("./routes/bounce.route");
const monthEndSnapshotRoutes = require("./routes/monthEndSnapshot.route");
const commTemplateRoutes = require("./routes/commTemplate.route");
const loanTypeVersionRoutes = require("./routes/loanTypeVersion.route");
const numberingRoutes = require("./routes/numbering.route");
const coBorrowerRoutes = require("./routes/coBorrower.route");
const underwriterRoutes = require("./routes/underwriter.route");
const foirRoutes = require("./routes/foir.route");
const disbursalChecklistRoutes = require("./routes/disbursalChecklist.route");
const disbursalHoldRoutes = require("./routes/disbursalHold.route");
const notificationRoutes = require("./routes/notification.route");
const npaRoutes = require("./routes/npa.route");
const superAdminRoutes = require("./routes/superAdmin.route");
const fieldVisitRoutes = require("./routes/fieldVisit.route");
const documentRoutes = require("./routes/document.route");
const cibilRoutes = require("./routes/cibil.route");
const legalActionRoutes = require("./routes/legalAction.route");
const rbiReturnRoutes = require("./routes/rbiReturn.route");

// ─── Security & utility middleware ─────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());
app.use(morgan("combined"));

// Global rate limit — 200 req/min per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(globalLimiter);

// Stricter limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts, please try again later." },
});

app.use(
  cors({
    origin: [
      "https://admin.kushalfinance.com",
      "https://uat.kushalfinance.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options(/.*/, (req, res) => {
  res.sendStatus(200);
});

app.use(express.json({ limit: "10mb" }));

// ─── Health check ───────────────────────────────────────────────────────────
const prisma = require("./lib/prisma");
const startTime = Date.now();

app.get("/api/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      db: "connected",
      version: process.env.APP_VERSION || "1.0.0",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({ status: "error", db: "disconnected", error: err.message });
  }
});

app.get("/api/version", (req, res) => {
  res.json({ version: process.env.APP_VERSION || "1.0.0", env: process.env.NODE_ENV || "production" });
});

app.get("/", async (req, res) => {
  res.json({ status: 200, data: process.env.COMPANY_NAME?.toLowerCase() });
});

app.use("/api/status", (req, res) => {
  res.json({ status: 200, data: "Server is running!" });
});

// ─── Routes ────────────────────────────────────────────────────────────────
// authLimiter applied only to login/forgot-password endpoints, not the entire admin router
app.use("/api/admin/login", authLimiter);
app.use("/api/admin/forgot-password", authLimiter);
app.use("/api/admin/reset-password", authLimiter);
app.use("/api/admin", adminRoutes);
app.use("/api/employee/login", authLimiter);
app.use("/api/employee", employeeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/list", listRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/user-auth", authLimiter, userAuthRoutes);
app.use("/api/terminate", terminateRoute);
app.use("/api/file", uploadRoute);
app.use("/api/photoId", photoIdRoute);
app.use("/api/loan", loanRoute);
app.use("/api/loanType", loanTypeRoute);
app.use("/api/loan-application", loanApplicationRoute);
app.use("/api/user-application", userApplicationRoute);
app.use("/api/state", stateRoute);
app.use("/api/city", cityRoute);
app.use("/api/region", regionRoute);
app.use("/api/report", reportRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/public", publicUserRoutes);
app.use("/api/icici-payment", iciciPaymentRoutes);
app.use("/api/seized", seizedRoutes);
app.use("/api/bulk-upload", bulkUploadRoutes);
app.use("/api/otp", otpRoutes);
app.use("/api/app-config", appConfigRoutes);
app.use("/api/grievance", grievanceRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/approval-matrix", approvalMatrixRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/consent", consentRoutes);
app.use("/api/restructuring", restructuringRoutes);
app.use("/api/reconciliation", reconciliationRoutes);
app.use("/api/collections-enhanced", collectionEnhancedRoutes);
app.use("/api/collateral", collateralRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/reports", savedReportRoutes);
app.use("/api/automation", automationRoutes);
app.use("/api/compliance", complianceRoutes);
app.use("/api/nach", nachRoutes);
app.use("/api/bounce", bounceRoutes);
app.use("/api/month-end-snapshot", monthEndSnapshotRoutes);
app.use("/api/comm-templates", commTemplateRoutes);
app.use("/api/loan-type-versions", loanTypeVersionRoutes);
app.use("/api/numbering", numberingRoutes);
app.use("/api/co-borrowers", coBorrowerRoutes);
app.use("/api/underwriter", underwriterRoutes);
app.use("/api/foir", foirRoutes);
app.use("/api/disbursal-checklist", disbursalChecklistRoutes);
app.use("/api/disbursal-hold", disbursalHoldRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/npa", npaRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/field-visits", fieldVisitRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/cibil", cibilRoutes);
app.use("/api/legal-actions", legalActionRoutes);
app.use("/api/rbi-returns", rbiReturnRoutes);

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

const { seedDefaultTemplates } = require("./utils/seedDefaultTemplates");

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  initializeCronJobs();

  // Seed default comm templates on first run (idempotent)
  try { await seedDefaultTemplates(); } catch (e) { console.warn("Comm template seed skipped:", e.message); }

  console.log("🔄 Running initial fine update on startup...");
  try {
    await updateAllOverdueFines();
    console.log("✅ Initial fine update completed");
  } catch (error) {
    console.error("❌ Initial fine update failed:", error.message);
  }
});
