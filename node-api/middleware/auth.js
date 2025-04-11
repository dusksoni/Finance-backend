const jwt = require("jsonwebtoken");
const SECRET = process.env.SECRET_KEY;

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token missing" });

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.type !== "ADMIN") {
    return res.status(403).json({ error: "Admins only" });
  }
  next();
}

function onlyAdminOrEmployee(req, res, next) {
  if (!["ADMIN", "EMPLOYEE"].includes(req.user?.type)) {
    return res.status(403).json({ error: "Not allowed" });
  }
  next();
}

function checkPermission(req, permission) {
  const userPermissions = req.user?.permissions || [];
  if (!userPermissions.includes(permission)) {
    return res.status(403).json({ error: "Forbidden: No access" });
  }
}

module.exports = { authMiddleware, adminOnly, onlyAdminOrEmployee, checkPermission };
