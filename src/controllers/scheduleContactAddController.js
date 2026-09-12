const mongoose = require("mongoose");
const ScheduleContactAdd = require("../models/ScheduleContactAdd");

exports.addScheduleContact = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    const existingContact = await ScheduleContactAdd.findOne({
      phone: cleanPhone,
      createdBy: req.user._id,
    });

    if (existingContact) {
      return res.status(409).json({
        success: false,
        message: "Schedule contact already exists",
        data: {
          id: existingContact._id,
          name: existingContact.name,
          phone: existingContact.phone,
        },
      });
    }

    const contact = await ScheduleContactAdd.create({
      name: cleanName,
      phone: cleanPhone,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      data: {
        name: contact.name,
        phone: contact.phone,
        tags: contact.tags,
        lists: contact.lists,
        status: contact.status,
        createdBy: contact.createdBy,
        id: contact._id,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        _v: contact.__v,
      },
    });
  } catch (error) {
    console.error("Add Schedule Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to add schedule contact",
      error: error.message,
    });
  }
};

exports.getScheduleContacts = async (req, res) => {
  try {
    const contacts = await ScheduleContactAdd.find({
      createdBy: req.user._id,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: contacts.length,
      data: contacts.map((contact) => ({
        name: contact.name,
        phone: contact.phone,
        tags: contact.tags,
        lists: contact.lists,
        status: contact.status,
        createdBy: contact.createdBy,
        id: contact._id,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        _v: contact.__v,
      })),
    });
  } catch (error) {
    console.error("Get Schedule Contacts Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get schedule contacts",
      error: error.message,
    });
  }
};

exports.getScheduleContact = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact ID",
      });
    }

    const contact = await ScheduleContactAdd.findOne({
      _id: id,
      createdBy: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Schedule contact not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        name: contact.name,
        phone: contact.phone,
        tags: contact.tags,
        lists: contact.lists,
        status: contact.status,
        createdBy: contact.createdBy,
        id: contact._id,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        _v: contact.__v,
      },
    });
  } catch (error) {
    console.error("Get Schedule Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get schedule contact",
      error: error.message,
    });
  }
};

exports.updateScheduleContact = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, tags, lists, status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact ID",
      });
    }

    const contact = await ScheduleContactAdd.findOne({
      _id: id,
      createdBy: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Schedule contact not found",
      });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Name cannot be empty",
        });
      }

      contact.name = name.trim();
    }

    if (phone !== undefined) {
      if (!phone.trim()) {
        return res.status(400).json({
          success: false,
          message: "Phone number cannot be empty",
        });
      }

      const cleanPhone = phone.trim();

      const duplicateContact = await ScheduleContactAdd.findOne({
        phone: cleanPhone,
        createdBy: req.user._id,
        _id: { $ne: id },
      });

      if (duplicateContact) {
        return res.status(409).json({
          success: false,
          message:
            "Another schedule contact already exists with this phone number",
        });
      }

      contact.phone = cleanPhone;
    }

    if (tags !== undefined) {
      if (!Array.isArray(tags)) {
        return res.status(400).json({
          success: false,
          message: "Tags must be an array",
        });
      }

      contact.tags = tags;
    }

    if (lists !== undefined) {
      if (!Array.isArray(lists)) {
        return res.status(400).json({
          success: false,
          message: "Lists must be an array",
        });
      }

      contact.lists = lists;
    }

    if (status !== undefined) {
      if (!["Active", "Inactive"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be Active or Inactive",
        });
      }

      contact.status = status;
    }

    await contact.save();

    return res.status(200).json({
      success: true,
      message: "Schedule contact updated successfully",
      data: {
        name: contact.name,
        phone: contact.phone,
        tags: contact.tags,
        lists: contact.lists,
        status: contact.status,
        createdBy: contact.createdBy,
        id: contact._id,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
        _v: contact.__v,
      },
    });
  } catch (error) {
    console.error("Update Schedule Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update schedule contact",
      error: error.message,
    });
  }
};

exports.deleteScheduleContact = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact ID",
      });
    }

    const contact = await ScheduleContactAdd.findOneAndDelete({
      _id: id,
      createdBy: req.user._id,
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Schedule contact not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Schedule contact deleted successfully",
      data: {
        id: contact._id,
      },
    });
  } catch (error) {
    console.error("Delete Schedule Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete schedule contact",
      error: error.message,
    });
  }
};
exports.deleteAllScheduleContacts = async (req, res) => {
  try {
    const result = await ScheduleContactAdd.deleteMany({
      createdBy: req.user._id,
    });

    return res.status(200).json({
      success: true,
      message: "All schedule contacts deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Delete All Schedule Contacts Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete all schedule contacts",
      error: error.message,
    });
  }
};
