const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middleware/auth");
const c = require("../controllers/coBorrower.controller");

router.use(authMiddleware);

router.post("/", c.addCoBorrower);
router.get("/", c.listCoBorrowers);
router.put("/:id", c.updateCoBorrower);
router.delete("/:id", c.removeCoBorrower);

module.exports = router;
