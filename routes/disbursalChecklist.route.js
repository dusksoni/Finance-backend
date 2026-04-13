const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/disbursalChecklist.controller");

router.use(authMiddleware);

router.post("/", c.createChecklist);
router.get("/loan/:loanId", c.getChecklist);
router.patch("/loan/:loanId/item", c.updateItem);

module.exports = router;
