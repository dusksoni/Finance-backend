const express = require("express");
const router = express.Router();
const { authMiddleware, adminOnly, onlyAdminOrEmployee } = require("../middleware/auth");
const roleController = require("../controllers/role.controller");

// Protect all with admin access
router.use(authMiddleware, onlyAdminOrEmployee);

router.get("/", roleController.listRoles);
router.get("/permissions/all", roleController.listAllPermissions);
router.get("/:id", roleController.getRoleById);
router.post("/", roleController.createRole);
router.put("/:id", roleController.updateRole);
router.delete("/:id", roleController.deleteRole);

module.exports = router;
