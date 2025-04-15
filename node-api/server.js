const express = require("express");
require("dotenv").config();
const app = express();
const cors = require("cors");


const adminRoutes = require("./routes/admin.route");
const employeeRoutes = require("./routes/employee.route");
const userRoutes = require("./routes/user.route");
const roleRoutes = require("./routes/role.route");
const userAuthRoutes = require("./routes/user.auth.route");
const terminateRoute = require("./routes/terminate.route");
const uploadRoute = require("./routes/upload.route");
const photoIdRoute = require("./routes/photoIdType.routes");

app.use(cors());
app.use(express.json());
app.use("/api/admin", adminRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/user-auth", userAuthRoutes);
app.use("/api/terminate", terminateRoute);
app.use("/api/file", uploadRoute);
app.use("/api/photoId", photoIdRoute);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
