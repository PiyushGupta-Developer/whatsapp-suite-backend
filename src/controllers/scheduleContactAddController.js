const ScheduleContactAdd = require("../models/ScheduleContactAdd");

// ============================================================
// ADD SCHEDULE CONTACT
// ============================================================

exports.addScheduleContact = async (req, res) => {
  try {
    const { name, phone } = req.body;

    // ----------------------------------------------------------
    // 1. Validate name
    // ----------------------------------------------------------

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required",
      });
    }

    // ----------------------------------------------------------
    // 2. Validate phone
    // ----------------------------------------------------------

    if (!phone || !phone.trim()) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    // ----------------------------------------------------------
    // 3. Clean values
    // ----------------------------------------------------------

    const cleanName = name.trim();
    const cleanPhone = phone.trim();

    // ----------------------------------------------------------
    // 4. Check duplicate phone
    // ----------------------------------------------------------

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

    // ----------------------------------------------------------
    // 5. Create new schedule contact
    // ----------------------------------------------------------

    const contact = await ScheduleContactAdd.create({
      name: cleanName,
      phone: cleanPhone,
      createdBy: req.user._id,
    });

    // ----------------------------------------------------------
    // 6. Return response
    // ----------------------------------------------------------

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
