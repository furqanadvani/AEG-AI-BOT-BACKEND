const express = require("express");

const router = express.Router();

const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middlewares/auth");
const { loginLimiter } = require("../middlewares/rateLimit");

router.post("/login", loginLimiter, authController.login);

router.get("/profile", authMiddleware, authController.getProfile);

router.post("/forgot-password", loginLimiter, authController.forgotPassword);

router.post("/reset-password", loginLimiter, authController.resetPassword);

router.post("/change-password", authMiddleware, authController.changePassword);

module.exports = router;
