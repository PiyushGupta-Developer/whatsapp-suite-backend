const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Group = require("../models/Group");
const { store, init, isMongoConnected } = require("../utils/memoryStore");
const messageService = require("../services/messageService");
function parseJsonField(value, fallback = []) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  return fallback;
}

function nextRepeatDate(date, repeat) {
  const d = new Date(date);
  if (repeat === "Daily") d.setDate(d.getDate() + 1);
  else if (repeat === "Weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "Monthly") d.setMonth(d.getMonth() + 1);
  else return null;
  return d;
}

async function expandRecipients(body, userId) {
  let list = Array.isArray(body.recipients)
    ? body.recipients
    : Array.isArray(body.contacts)
      ? body.contacts
      : [];

  if (isMongoConnected()) {
    const ids = list
      .filter((x) => typeof x === "string" || (x && x._id))
      .map((x) => String(x._id || x));

    // Sirf logged-in user ke contacts
    if (ids.length) {
      list = await Contact.find({
        _id: { $in: ids },
        createdBy: userId,
        status: { $ne: "Unsubscribed" },
      }).lean();
    }

    // Sirf logged-in user ki contact lists ke contacts
    if (Array.isArray(body.contactListIds) && body.contactListIds.length) {
      const extra = await Contact.find({
        lists: { $in: body.contactListIds },
        createdBy: userId,
        status: { $ne: "Unsubscribed" },
      }).lean();

      list = [...list, ...extra];
    }

    // Sirf logged-in user ke contacts
    if (Array.isArray(body.groups) && body.groups.length) {
      const extra = await Contact.find({
        group: { $in: body.groups },
        createdBy: userId,
        status: { $ne: "Unsubscribed" },
      })
        .lean()
        .catch(() => []);

      list = [...list, ...extra];
    }
  } else {
    // Memory store me bhi sirf logged-in user ke contacts
    await init();

    list = list.filter((contact) => {
      if (typeof contact === "string") {
        const found = store.contacts.find(
          (c) =>
            String(c._id) === String(contact) &&
            String(c.createdBy) === String(userId),
        );
        return !!found;
      }

      if (contact?._id) {
        return String(contact.createdBy) === String(userId);
      }

      // Direct recipient ko allow karenge
      return !!(contact?.phone || contact?.number);
    });
  }

  const seen = new Set();

  return list.filter((c) => {
    const phone = c.phone || c.number;

    if (!phone || seen.has(String(phone))) return false;

    seen.add(String(phone));
    return true;
  });
}

async function persistCampaign(data, req) {
  if (isMongoConnected()) {
    return Campaign.create({ ...data, createdBy: req.user?._id });
  }
  await init();
  const campaign = {
    _id: `c${Date.now()}`,
    ...data,
    createdAt: new Date().toISOString(),
    createdBy: req.user?._id,
  };
  store.campaigns.unshift(campaign);
  return campaign;
}

async function executeCampaign(campaign, recipients) {
  campaign.status = "Running";
  campaign.startedAt = new Date();
  const items = recipients.map((contact) => ({
    phone: contact.phone || contact.number,
    jid: contact.whatsappId || contact.jid,
    contact,
    message: campaign.message || "",
    sendText: campaign.sendText !== false,
    mediaFiles: campaign.mediaFiles || [],
  }));

  const result = await messageService.sendBulk(
    items,
    campaign.deviceIds?.length
      ? campaign.deviceIds
      : campaign.device
        ? [campaign.device]
        : [],
  );
  const sent = result.results.filter((r) => r.ok).length;
  const failed = result.results.length - sent;

  if (isMongoConnected()) {
    const updated = await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        sent,
        delivered: 0,
        read: 0,
        failed,
        recipients: items.length,
        status: failed === items.length ? "Failed" : "Completed",
        completedAt: new Date(),
        report: { total: items.length, sent, failed, results: result.results },
      },
      { new: true },
    );
    return updated;
  }

  campaign.sent = sent;
  campaign.delivered = 0;
  campaign.read = 0;
  campaign.failed = failed;
  campaign.status = failed === items.length ? "Failed" : "Completed";
  campaign.completedAt = new Date().toISOString();
  campaign.report = {
    total: items.length,
    sent,
    failed,
    results: result.results,
  };
  return campaign;
}

exports.getCampaigns = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const userId = req.user._id;

    if (isMongoConnected()) {
      const filter = {
        createdBy: userId,
      };

      if (status && status !== "All Status") {
        filter.status = status;
      }

      const p = Math.max(1, parseInt(page, 10));
      const l = Math.min(100, Math.max(1, parseInt(limit, 10)));

      const [campaigns, total] = await Promise.all([
        Campaign.find(filter)
          .populate(
            "device deviceIds contacts createdBy",
            "name phoneNumber phone email",
          )
          .sort({ createdAt: -1 })
          .skip((p - 1) * l)
          .limit(l),

        Campaign.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        count: campaigns.length,
        total,
        page: p,
        pages: Math.ceil(total / l),
        data: campaigns,
      });
    }

    await init();

    let list = store.campaigns.filter(
      (c) => String(c.createdBy) === String(userId),
    );

    if (status && status !== "All Status") {
      list = list.filter((c) => c.status === status);
    }

    return res.json({
      success: true,
      count: list.length,
      total: list.length,
      page: 1,
      pages: 1,
      data: list,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const c = await Campaign.findOne({
        _id: req.params.id,
        createdBy: userId,
      }).populate("device deviceIds contacts createdBy");

      if (!c) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      return res.json({
        success: true,
        data: c,
      });
    }

    await init();

    const c = store.campaigns.find(
      (x) =>
        String(x._id) === String(req.params.id) &&
        String(x.createdBy) === String(userId),
    );

    if (!c) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      data: c,
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const {
      name,
      message = "",
      mediaFiles = [],
      recipients,
      contacts,
      contactIds,
      deviceId,
      deviceIds,
      scheduledAt,
      timezone = "Asia/Kolkata",
      repeat = "No Repeat",
      endDate,
      sendNow = false,
      sendText = true,
    } = req.body;

    // Existing mediaFiles from JSON body
    let finalMediaFiles = Array.isArray(mediaFiles)
      ? mediaFiles
      : [];
console.log("\n========== MEDIA DEBUG ==========");
console.log("req.files:", req.files);
console.log("req.files length:", req.files?.length || 0);
console.log("=================================\n");
    // Direct files uploaded through Bulk API
    if (req.files && req.files.length > 0) {
      const uploadedFiles = req.files.map((file) => ({
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        path: `/uploads/${file.filename}`,
        type: file.mimetype.startsWith("image/")
          ? "Image"
          : file.mimetype.startsWith("video/")
            ? "Video"
            : file.mimetype.startsWith("audio/")
              ? "Audio"
              : "Document",
      }));

      finalMediaFiles = [...finalMediaFiles, ...uploadedFiles];
    }

    const parsedRecipients = parseJsonField(recipients);
    const parsedContacts = parseJsonField(contacts);
    const parsedContactIds = parseJsonField(contactIds);

    const recipientInput =
      parsedRecipients.length > 0
        ? parsedRecipients
        : parsedContacts.length > 0
          ? parsedContacts
          : parsedContactIds;

    const body = {
      ...req.body,
      recipients: recipientInput,
    };

    const list = await expandRecipients(body, req.user._id);

    // Validate message or media
    if (!message && !finalMediaFiles.length) {
      return res.status(400).json({
        success: false,
        message: "message or mediaFiles required",
      });
    }

    // Validate recipients
    if (!list.length) {
      return res.status(400).json({
        success: false,
        message: "At least one recipient/contact is required",
      });
    }

    const runAt = scheduledAt ? new Date(scheduledAt) : null;

    if (runAt && Number.isNaN(runAt.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid scheduledAt",
      });
    }

    const parsedDeviceIds = parseJsonField(deviceIds);

    const ids =
      Array.isArray(parsedDeviceIds) && parsedDeviceIds.length > 0
        ? parsedDeviceIds
        : deviceId
          ? [deviceId]
          : [];

    const data = {
      name: name || `Campaign ${new Date().toISOString()}`,
      message,
      sendText: sendText !== false,

      // IMPORTANT: Use uploaded + existing media
      mediaFiles: finalMediaFiles,

      recipients: list.length,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,

      status: sendNow ? "Running" : runAt ? "Scheduled" : "Draft",

      scheduledAt: runAt,
      nextRunAt: runAt,

      timezone,
      repeat,

      endDate: endDate ? new Date(endDate) : null,

      device: ids.length === 1 ? ids[0] : undefined,

      deviceIds: ids,

      contacts: isMongoConnected()
        ? list.map((x) => x._id).filter(Boolean)
        : [],

      directRecipients: list
        .filter((x) => !x._id)
        .map((x) => ({
          name: x.name || "",
          phone: x.phone || x.number || "",
          whatsappId: x.whatsappId || x.jid || "",
        })),

      estimatedTimeMinutes: Math.ceil(
        list.length / Math.max(1, ids.length || 1) / 80,
      ),
    };
console.log("Final media files:", finalMediaFiles);
    const campaign = await persistCampaign(data, req);

    if (sendNow) {
      executeCampaign(campaign, list).catch(async (e) => {
        console.error("[Campaign] send error:", e.message);

        if (isMongoConnected()) {
          await Campaign.findByIdAndUpdate(campaign._id, {
            status: "Failed",
            failed: list.length,
            completedAt: new Date(),
          });
        } else {
          campaign.status = "Failed";
          campaign.failed = list.length;
        }
      });
    }

    return res.status(201).json({
      success: true,
      data: campaign,
      queued: list.length,
      message: sendNow
        ? "Campaign accepted and sending in background"
        : runAt
          ? "Campaign scheduled"
          : "Campaign saved as draft",
    });
  } catch (error) {
    console.error("[Campaign] create error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
exports.updateCampaign = async (req, res) => {
  try {
    const userId = req.user._id;

    // User ownership change nahi kar sakta
    delete req.body.createdBy;

    if (isMongoConnected()) {
      const c = await Campaign.findOneAndUpdate(
        {
          _id: req.params.id,
          createdBy: userId,
        },
        req.body,
        {
          new: true,
          runValidators: true,
        },
      );

      if (!c) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      return res.json({
        success: true,
        data: c,
      });
    }

    await init();

    const c = store.campaigns.find(
      (x) =>
        String(x._id) === String(req.params.id) &&
        String(x.createdBy) === String(userId),
    );

    if (!c) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    Object.assign(c, req.body, {
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      data: c,
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e.message,
    });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const c = await Campaign.findOneAndDelete({
        _id: req.params.id,
        createdBy: userId,
      });

      if (!c) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      return res.json({
        success: true,
        message: "Campaign deleted",
      });
    }

    await init();

    const i = store.campaigns.findIndex(
      (x) =>
        String(x._id) === String(req.params.id) &&
        String(x.createdBy) === String(userId),
    );

    if (i < 0) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    store.campaigns.splice(i, 1);

    return res.json({
      success: true,
      message: "Campaign deleted",
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const [totalContacts, campaigns] = await Promise.all([
        Contact.countDocuments({
          createdBy: userId,
        }),

        Campaign.find({
          createdBy: userId,
        }).lean(),
      ]);

      const messagesSent = campaigns.reduce((s, c) => s + (c.sent || 0), 0);

      const delivered = campaigns.reduce((s, c) => s + (c.delivered || 0), 0);

      const failed = campaigns.reduce((s, c) => s + (c.failed || 0), 0);

      const totalRecipients = campaigns.reduce(
        (s, c) => s + (c.recipients || 0),
        0,
      );

      const pending = Math.max(0, totalRecipients - messagesSent - failed);

      return res.json({
        success: true,
        data: {
          totalContacts,
          messagesSent,
          delivered,
          failed,
          pending,

          recentCampaigns: campaigns
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5),

          campaignStatus: {
            Delivered: delivered,
            Failed: failed,
            Pending: pending,
          },

          deliveredRate: messagesSent
            ? Number(((delivered / messagesSent) * 100).toFixed(1))
            : 0,
        },
      });
    }

    // MEMORY STORE
    await init();

    const contacts = store.contacts.filter(
      (c) => String(c.createdBy) === String(userId),
    );

    const campaigns = store.campaigns.filter(
      (c) => String(c.createdBy) === String(userId),
    );

    const messagesSent = campaigns.reduce((s, c) => s + (c.sent || 0), 0);

    const delivered = campaigns.reduce((s, c) => s + (c.delivered || 0), 0);

    const failed = campaigns.reduce((s, c) => s + (c.failed || 0), 0);

    const totalRecipients = campaigns.reduce(
      (s, c) => s + (c.recipients || 0),
      0,
    );

    const pending = Math.max(0, totalRecipients - messagesSent - failed);

    return res.json({
      success: true,
      data: {
        totalContacts: contacts.length,
        messagesSent,
        delivered,
        failed,
        pending,

        recentCampaigns: campaigns
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 5),

        campaignStatus: {
          Delivered: delivered,
          Failed: failed,
          Pending: pending,
        },

        deliveredRate: messagesSent
          ? Number(((delivered / messagesSent) * 100).toFixed(1))
          : 0,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

exports.sendCampaign = async (req, res) => {
  try {
    const userId = req.user._id;

    let campaign;
    let list;

    if (isMongoConnected()) {
      // Sirf apna campaign
      campaign = await Campaign.findOne({
        _id: req.params.id,
        createdBy: userId,
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      // Sirf apne contacts
      list = await Contact.find({
        _id: {
          $in: campaign.contacts,
        },
        createdBy: userId,
        status: {
          $ne: "Unsubscribed",
        },
      }).lean();

      // Direct recipients bhi include karo
      const directRecipients = Array.isArray(campaign.directRecipients)
        ? campaign.directRecipients
        : [];

      list = [...list, ...directRecipients];
    } else {
      await init();

      campaign = store.campaigns.find(
        (c) =>
          String(c._id) === String(req.params.id) &&
          String(c.createdBy) === String(userId),
      );

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      const contactIds = Array.isArray(campaign.contacts)
        ? campaign.contacts
        : [];

      list = store.contacts.filter(
        (contact) =>
          contactIds.some((id) => String(id) === String(contact._id)) &&
          String(contact.createdBy) === String(userId),
      );

      if (Array.isArray(campaign.directRecipients)) {
        list.push(...campaign.directRecipients);
      }
    }

    if (!list.length) {
      return res.status(400).json({
        success: false,
        message: "No valid recipients found",
      });
    }

    executeCampaign(campaign, list).catch((e) =>
      console.error("[Campaign] send error:", e.message),
    );

    return res.json({
      success: true,
      message: "Campaign accepted for sending",
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      message: e.message,
    });
  }
};

exports.getReport = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const c = await Campaign.findOne({
        _id: req.params.id,
        createdBy: userId,
      }).select(
        "name recipients sent delivered read failed status report createdAt completedAt",
      );

      if (!c) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      return res.json({
        success: true,
        data: c,
        report: {
          total: c.recipients,
          sent: c.sent,
          delivered: c.delivered,
          failed: c.failed,
          read: c.read,
          status: c.status,
        },
      });
    }

    await init();

    const c = store.campaigns.find(
      (x) =>
        String(x._id) === String(req.params.id) &&
        String(x.createdBy) === String(userId),
    );

    if (!c) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    return res.json({
      success: true,
      data: c,
      report: {
        total: c.recipients,
        sent: c.sent,
        delivered: c.delivered,
        failed: c.failed,
        read: c.read,
        status: c.status,
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};

exports.getReports = async (req, res) => {
  try {
    const userId = req.user._id;
    let campaigns = [];

    if (isMongoConnected()) {
      campaigns = await Campaign.find({
        createdBy: userId,
      }).lean();
    } else {
      await init();

      campaigns = store.campaigns.filter(
        (c) => String(c.createdBy) === String(userId),
      );
    }

    const summary = campaigns.reduce(
      (a, c) => {
        a.total += c.recipients || 0;
        a.sent += c.sent || 0;
        a.delivered += c.delivered || 0;
        a.failed += c.failed || 0;
        a.read += c.read || 0;

        return a;
      },
      {
        total: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        read: 0,
      },
    );

    const byDayMap = {};

    campaigns.forEach((c) => {
      const key = new Date(c.createdAt || Date.now())
        .toISOString()
        .slice(0, 10);

      if (!byDayMap[key]) {
        byDayMap[key] = {
          date: key,
          sent: 0,
          delivered: 0,
          failed: 0,
          read: 0,
        };
      }

      byDayMap[key].sent += c.sent || 0;
      byDayMap[key].delivered += c.delivered || 0;
      byDayMap[key].failed += c.failed || 0;
      byDayMap[key].read += c.read || 0;
    });

    return res.json({
      success: true,

      data: {
        summary: {
          ...summary,

          deliveryRate: summary.sent
            ? Number(((summary.delivered / summary.sent) * 100).toFixed(1))
            : 0,

          failRate: summary.total
            ? Number(((summary.failed / summary.total) * 100).toFixed(1))
            : 0,

          readRate: summary.delivered
            ? Number(((summary.read / summary.delivered) * 100).toFixed(1))
            : 0,
        },

        byDay: Object.values(byDayMap).sort((a, b) =>
          a.date.localeCompare(b.date),
        ),

        campaigns: campaigns.map((c) => ({
          id: c._id,
          name: c.name,
          status: c.status,
          total: c.recipients || 0,
          sent: c.sent || 0,
          delivered: c.delivered || 0,
          failed: c.failed || 0,
          read: c.read || 0,
        })),
      },
    });
  } catch (e) {
    res.status(500).json({
      success: false,
      message: e.message,
    });
  }
};
// ============================================================
// GET ALL SCHEDULES
// GET /schedule
// ============================================================
exports.getSchedules = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    const filter = {
      createdBy: userId,
      scheduledAt: { $ne: null },
    };

    if (status && status !== "All Status") {
      filter.status = status;
    }

    // ===============================
    // MONGODB
    // ===============================
    if (isMongoConnected()) {
      const p = Math.max(1, parseInt(page, 10));
      const l = Math.min(100, Math.max(1, parseInt(limit, 10)));

      const [schedules, total] = await Promise.all([
        Campaign.find(filter)
          .populate("device deviceIds contacts")
          .sort({ scheduledAt: -1 })
          .skip((p - 1) * l)
          .limit(l),

        Campaign.countDocuments(filter),
      ]);

      return res.status(200).json({
        success: true,
        count: schedules.length,
        total,
        page: p,
        pages: Math.ceil(total / l),
        data: schedules,
      });
    }

    // ===============================
    // MEMORY STORE
    // ===============================
    await init();

    let schedules = store.campaigns.filter(
      (campaign) =>
        String(campaign.createdBy) === String(userId) &&
        campaign.scheduledAt
    );

    if (status && status !== "All Status") {
      schedules = schedules.filter(
        (campaign) => campaign.status === status
      );
    }

    schedules.sort(
      (a, b) =>
        new Date(b.scheduledAt) - new Date(a.scheduledAt)
    );

    return res.status(200).json({
      success: true,
      count: schedules.length,
      total: schedules.length,
      page: 1,
      pages: 1,
      data: schedules,
    });

  } catch (error) {
    console.error("[Schedule] getSchedules error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ============================================================
// GET SINGLE SCHEDULE
// GET /schedule/:id
// ============================================================
exports.getSchedule = async (req, res) => {
  try {
    const userId = req.user._id;
    const scheduleId = req.params.id;

    // ===============================
    // MONGODB
    // ===============================
    if (isMongoConnected()) {
      const schedule = await Campaign.findOne({
        _id: scheduleId,
        createdBy: userId,
        scheduledAt: { $ne: null },
      }).populate("device deviceIds contacts");

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: "Schedule not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: schedule,
      });
    }

    // ===============================
    // MEMORY STORE
    // ===============================
    await init();

    const schedule = store.campaigns.find(
      (campaign) =>
        String(campaign._id) === String(scheduleId) &&
        String(campaign.createdBy) === String(userId) &&
        campaign.scheduledAt
    );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: schedule,
    });

  } catch (error) {
    console.error("[Schedule] getSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ============================================================
// UPDATE SCHEDULE
// PUT /schedule/:id
// ============================================================
exports.updateSchedule = async (req, res) => {
  try {
    const userId = req.user._id;
    const scheduleId = req.params.id;

    // Security
    delete req.body.createdBy;

    // ===============================
    // MONGODB
    // ===============================
    if (isMongoConnected()) {

      const existingSchedule = await Campaign.findOne({
        _id: scheduleId,
        createdBy: userId,
        scheduledAt: { $ne: null },
      });

      if (!existingSchedule) {
        return res.status(404).json({
          success: false,
          message: "Schedule not found",
        });
      }

      // Running / Completed ko edit nahi karenge
      if (
        existingSchedule.status === "Running" ||
        existingSchedule.status === "Completed"
      ) {
        return res.status(400).json({
          success: false,
          message: "Running or completed schedule cannot be edited",
        });
      }

      const updateData = {};

      // NAME
      if (req.body.name !== undefined) {
        updateData.name = req.body.name;
      }

      // MESSAGE
      if (req.body.message !== undefined) {
        updateData.message = req.body.message;
      }

      // SEND TEXT
      if (req.body.sendText !== undefined) {
        updateData.sendText =
          req.body.sendText === true ||
          req.body.sendText === "true";
      }

      // SCHEDULE DATE
      if (req.body.scheduledAt !== undefined) {
        const scheduledDate = new Date(req.body.scheduledAt);

        if (Number.isNaN(scheduledDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid scheduledAt",
          });
        }

        if (scheduledDate <= new Date()) {
          return res.status(400).json({
            success: false,
            message: "scheduledAt must be a future date and time",
          });
        }

        updateData.scheduledAt = scheduledDate;
        updateData.nextRunAt = scheduledDate;

        updateData.status = "Scheduled";
      }

      // TIMEZONE
      if (req.body.timezone !== undefined) {
        updateData.timezone = req.body.timezone;
      }

      // REPEAT
      if (req.body.repeat !== undefined) {
        const allowedRepeats = [
          "No Repeat",
          "Daily",
          "Weekly",
          "Monthly",
          "Custom",
        ];

        if (!allowedRepeats.includes(req.body.repeat)) {
          return res.status(400).json({
            success: false,
            message: "Invalid repeat value",
          });
        }

        updateData.repeat = req.body.repeat;
      }

      // END DATE
      if (req.body.endDate !== undefined) {
        updateData.endDate =
          req.body.endDate
            ? new Date(req.body.endDate)
            : null;
      }

      // DEVICE IDs
      if (
        req.body.deviceIds !== undefined ||
        req.body.deviceId !== undefined
      ) {
        const parsedDeviceIds =
          parseJsonField(req.body.deviceIds);

        const ids =
          Array.isArray(parsedDeviceIds) &&
          parsedDeviceIds.length > 0
            ? parsedDeviceIds
            : req.body.deviceId
              ? [req.body.deviceId]
              : [];

        updateData.deviceIds = ids;
        updateData.device =
          ids.length === 1
            ? ids[0]
            : undefined;
      }

      // RECIPIENTS
      if (req.body.recipients !== undefined) {
        const parsedRecipients =
          parseJsonField(req.body.recipients);

        if (!Array.isArray(parsedRecipients)) {
          return res.status(400).json({
            success: false,
            message: "Invalid recipients format",
          });
        }

        const directRecipients =
          parsedRecipients
            .map((recipient) => ({
              name: recipient.name || "",
              phone:
                recipient.phone ||
                recipient.number ||
                "",
              whatsappId:
                recipient.whatsappId ||
                recipient.jid ||
                "",
            }))
            .filter((recipient) => recipient.phone);

        if (!directRecipients.length) {
          return res.status(400).json({
            success: false,
            message:
              "At least one valid recipient is required",
          });
        }

        updateData.directRecipients =
          directRecipients;

        updateData.contacts = [];

        updateData.recipients =
          directRecipients.length;
      }

      // ===============================
      // EXISTING MEDIA
      // ===============================
      let finalMediaFiles =
        Array.isArray(existingSchedule.mediaFiles)
          ? [...existingSchedule.mediaFiles]
          : [];

      // mediaFiles JSON
      if (req.body.mediaFiles !== undefined) {
        const parsedMediaFiles =
          parseJsonField(
            req.body.mediaFiles,
            []
          );

        if (Array.isArray(parsedMediaFiles)) {
          finalMediaFiles =
            parsedMediaFiles;
        }
      }

      // NEW UPLOADED FILES
      if (req.files && req.files.length > 0) {
        const uploadedFiles =
          req.files.map((file) => ({
            filename: file.filename,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            path: `/uploads/${file.filename}`,
            type:
              file.mimetype.startsWith("image/")
                ? "Image"
                : file.mimetype.startsWith("video/")
                  ? "Video"
                  : file.mimetype.startsWith("audio/")
                    ? "Audio"
                    : "Document",
          }));

        finalMediaFiles = [
          ...finalMediaFiles,
          ...uploadedFiles,
        ];
      }

      updateData.mediaFiles =
        finalMediaFiles;

      // ===============================
      // UPDATE
      // ===============================
      const updatedSchedule =
        await Campaign.findOneAndUpdate(
          {
            _id: scheduleId,
            createdBy: userId,
            scheduledAt: { $ne: null },
          },
          updateData,
          {
            new: true,
            runValidators: true,
          }
        );

      return res.status(200).json({
        success: true,
        message: "Schedule updated successfully",
        data: updatedSchedule,
      });
    }

    // ===============================
    // MEMORY STORE
    // ===============================
    await init();

    const schedule = store.campaigns.find(
      (campaign) =>
        String(campaign._id) === String(scheduleId) &&
        String(campaign.createdBy) === String(userId) &&
        campaign.scheduledAt
    );

    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    Object.assign(schedule, req.body, {
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Schedule updated successfully",
      data: schedule,
    });

  } catch (error) {
    console.error("[Schedule] updateSchedule error:", error);

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


// ============================================================
// DELETE SCHEDULE
// DELETE /schedule/:id
// ============================================================
exports.deleteSchedule = async (req, res) => {
  try {
    const userId = req.user._id;
    const scheduleId = req.params.id;

    // ===============================
    // MONGODB
    // ===============================
    if (isMongoConnected()) {
      const schedule =
        await Campaign.findOneAndDelete({
          _id: scheduleId,
          createdBy: userId,
          scheduledAt: { $ne: null },
        });

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: "Schedule not found",
        });
      }

      return res.status(200).json({
        success: true,
        message: "Schedule deleted successfully",
      });
    }

    // ===============================
    // MEMORY STORE
    // ===============================
    await init();

    const index =
      store.campaigns.findIndex(
        (campaign) =>
          String(campaign._id) === String(scheduleId) &&
          String(campaign.createdBy) === String(userId) &&
          campaign.scheduledAt
      );

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: "Schedule not found",
      });
    }

    store.campaigns.splice(index, 1);

    return res.status(200).json({
      success: true,
      message: "Schedule deleted successfully",
    });

  } catch (error) {
    console.error("[Schedule] deleteSchedule error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
module.exports = exports;
