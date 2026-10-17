const memberService = require("../services/member.service");

exports.addMember = async (req, res, next) => {
  try {
    const member = await memberService.addMember(
      req.user,
      req.body
    );

    return res.status(201).json({
      error: false,
      message: "Member added successfully",
      data: member,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMembers = async (req, res, next) => {
  try {
    const members = await memberService.getMembers(req.query);

    return res.status(200).json({
      error: false,
      data: members,
    });
  } catch (error) {
    next(error);
  }
};

exports.getMemberById = async (req, res, next) => {
  try {
    const member = await memberService.getMemberById(
      req.params.id
    );

    return res.status(200).json({
      error: false,
      data: member,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMember = async (req, res, next) => {
  try {
    const member = await memberService.updateMember(
      req.user,
      req.params.id,
      req.body
    );

    return res.status(200).json({
      error: false,
      message: "Member updated successfully",
      data: member,
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMemberStatus = async (req, res, next) => {
  try {
    const member = await memberService.updateMemberStatus(
      req.params.id,
      req.body.isActive
    );

    return res.status(200).json({
      error: false,
      message: `Member ${
        member.isActive ? "activated" : "disabled"
      } successfully`,
      data: member,
    });
  } catch (error) {
    next(error);
  }
};