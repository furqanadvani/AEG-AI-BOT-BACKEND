const authService = require("../services/auth.service");

exports.login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body || {});

    return res.status(200).json({
      error: false,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body || {});

    return res.status(200).json({
      error: false,
      message: "If the email exists, a password reset link has been sent",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const result = await authService.resetPassword(req.body || {});

    return res.status(200).json({
      error: false,
      message: "Password reset successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const result = await authService.getProfile(req.user.id);

    return res.status(200).json({
      error: false,
      message: "Profile fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
exports.changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body || {});

    return res.status(200).json({
      error: false,
      message: "Password changed successfully. Please login again.",
      data: null,
    });
  } catch (error) {
    next(error);
  }
};
