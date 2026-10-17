const notificationService = require("../services/notification.service");
const { successResponse } = require("../utils/apiResponse");

module.exports = {
  list: async (req, res) => {
    const { items, pagination, unreadCount } = await notificationService.list(req.user, req.query);
    return successResponse(res, "Notifications fetched successfully", items, 200, { pagination, unreadCount });
  },
  markRead: async (req, res) => successResponse(res, "Marked as read", await notificationService.markRead(req.user, req.params.id)),
};
