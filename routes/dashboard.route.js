const router = require("express").Router();
const { authMiddleware, onlyAdminOrEmployee } = require("../middleware/auth");
const dashboard = require("../controllers/dashboard.controller");

router.use(authMiddleware, onlyAdminOrEmployee);

router.get("/summary", dashboard.getSummary);

module.exports = router;


