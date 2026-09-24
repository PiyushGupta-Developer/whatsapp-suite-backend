/**
 * Persistent scheduler for one-time and recurring bulk campaigns.
 * Checks due campaigns every 15 seconds.
 */

const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const { store, init, isMongoConnected } = require('./memoryStore');
const messageService = require('../services/messageService');

let timer = null;

function nextRepeatDate(date, repeat) {
  const d = new Date(date);

  if (repeat === 'Daily') {
    d.setDate(d.getDate() + 1);
  } else if (repeat === 'Weekly') {
    d.setDate(d.getDate() + 7);
  } else if (repeat === 'Monthly') {
    d.setMonth(d.getMonth() + 1);
  } else {
    return null;
  }

  return d;
}
function nextBulkRepeatDate(
  date,
  repeatType,
  repeatMonths = [],
  completedMonths = [],
) {
  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  // ONE TIME
  if (repeatType === "ONE_TIME") {
    return null;
  }

  // EVERY 15 DAYS
  if (repeatType === "15_DAYS") {
    d.setDate(d.getDate() + 15);
    return d;
  }

  // EVERY 7 DAYS
  if (repeatType === "WEEKLY") {
    d.setDate(d.getDate() + 7);
    return d;
  }

  // MONTHLY - SELECTED MONTHS ONLY
  // One cycle only - next year repeat nahi hoga
  if (repeatType === "MONTHLY") {
    const months = Array.isArray(repeatMonths)
      ? [
          ...new Set(
            repeatMonths
              .map(Number)
              .filter(
                (month) => Number.isInteger(month) && month >= 1 && month <= 12,
              ),
          ),
        ]
      : [];

    const completed = Array.isArray(completedMonths)
      ? [
          ...new Set(
            completedMonths
              .map(Number)
              .filter(
                (month) => Number.isInteger(month) && month >= 1 && month <= 12,
              ),
          ),
        ]
      : [];

    if (!months.length) {
      return null;
    }

    // Completed months ko remove karo
    const remainingMonths = months.filter(
      (month) => !completed.includes(month),
    );

    // Saare selected months complete
    if (!remainingMonths.length) {
      return null;
    }

    const originalDay = d.getDate();
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = d.getSeconds();
    const milliseconds = d.getMilliseconds();

    // Current month ke next month se search
    let year = d.getFullYear();
    let monthIndex = d.getMonth() + 1;

    // Maximum 12 months search
    for (let i = 0; i < 12; i++) {
      if (monthIndex > 11) {
        monthIndex = 0;
        year++;
      }

      const monthNumber = monthIndex + 1;

      if (remainingMonths.includes(monthNumber)) {
        const lastDay = new Date(year, monthIndex + 1, 0).getDate();

        // Example:
        // 31 date + February => skip February
        if (originalDay <= lastDay) {
          return new Date(
            year,
            monthIndex,
            originalDay,
            hours,
            minutes,
            seconds,
            milliseconds,
          );
        }
      }

      monthIndex++;
    }

    return null;
  }

  return null;
}
function nextScheduleRepeatDate(
  date,
  repeatType,
  repeatMonths = [],
  completedMonths = [],
) {
  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return null;
  }

  if (repeatType === "ONE_TIME") {
    return null;
  }

  if (repeatType === "15_DAYS") {
    d.setUTCDate(d.getUTCDate() + 15);
    return d;
  }

  if (repeatType === "WEEKLY") {
    d.setUTCDate(d.getUTCDate() + 7);
    return d;
  }

  if (repeatType !== "MONTHLY") {
    return null;
  }

  const selectedMonths = Array.isArray(repeatMonths)
    ? [
        ...new Set(
          repeatMonths
            .map(Number)
            .filter(
              (month) => Number.isInteger(month) && month >= 1 && month <= 12,
            ),
        ),
      ]
    : [];

  const completed = Array.isArray(completedMonths)
    ? completedMonths.map(Number)
    : [];

  const remainingMonths = selectedMonths.filter(
    (month) => !completed.includes(month),
  );

  if (!remainingMonths.length) {
    return null;
  }

  const originalDay = d.getUTCDate();

  for (let offset = 1; offset <= 12; offset++) {
    const candidate = new Date(d);

    candidate.setUTCDate(1);

    candidate.setUTCMonth(d.getUTCMonth() + offset);

    const month = candidate.getUTCMonth() + 1;

    if (!remainingMonths.includes(month)) {
      continue;
    }

    const lastDay = new Date(
      Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0),
    ).getUTCDate();

    if (originalDay > lastDay) {
      continue;
    }

    candidate.setUTCDate(originalDay);

    return candidate;
  }

  return null;
}
async function executeScheduleMongoCampaign(campaign) {
  try {
    console.log("[Schedule Scheduler] Sending:", String(campaign._id));

    const dbRecipients = await Contact.find({
      _id: {
        $in: campaign.contacts || [],
      },
      createdBy: campaign.createdBy,
      status: {
        $ne: "Unsubscribed",
      },
    }).lean();

    const directRecipients = Array.isArray(campaign.directRecipients)
      ? campaign.directRecipients
      : [];

    const recipients = [...dbRecipients, ...directRecipients];

    const failCampaign = async (message, failedCount = recipients.length) => {
      console.error("[Schedule Scheduler]", message, String(campaign._id));

      await Campaign.findOneAndUpdate(
        {
          _id: campaign._id,
          status: "Running",
        },
        {
          $set: {
            status: "Failed",
            failed: failedCount,
            nextRunAt: null,
            completedAt: new Date(),
          },
        },
      );
    };

    if (!recipients.length) {
      await failCampaign("No recipients found", campaign.recipients || 0);

      return;
    }

    const devices =
      Array.isArray(campaign.deviceIds) && campaign.deviceIds.length > 0
        ? campaign.deviceIds
        : campaign.device
          ? [campaign.device]
          : [];

    if (!devices.length) {
      await failCampaign("No WhatsApp device found");

      return;
    }

    const items = recipients.map((contact) => ({
      phone: contact.phone || contact.number,
      jid: contact.whatsappId || contact.jid,
      contact,
      message: campaign.message || "",
      sendText: campaign.sendText !== false,
      mediaFiles: campaign.mediaFiles || [],
    }));

    const result = await messageService.sendBulk(items, devices);

    const results = Array.isArray(result?.results) ? result.results : [];

    const sent = results.filter((item) => item.ok === true).length;

    const failed = Math.max(0, items.length - sent);

    const currentRun = new Date(campaign.scheduledAt);

    if (Number.isNaN(currentRun.getTime())) {
      await failCampaign("Invalid campaign scheduledAt", failed);

      return;
    }

    const selectedMonths = Array.isArray(campaign.scheduleRepeatMonths)
      ? campaign.scheduleRepeatMonths.map(Number)
      : [];

    const completedMonths = [
      ...new Set(
        Array.isArray(campaign.scheduleCompletedMonths)
          ? campaign.scheduleCompletedMonths.map(Number)
          : [],
      ),
    ];

    if (campaign.scheduleRepeatType === "MONTHLY") {
      const currentMonth = currentRun.getUTCMonth() + 1;

      if (
        selectedMonths.includes(currentMonth) &&
        !completedMonths.includes(currentMonth)
      ) {
        completedMonths.push(currentMonth);
      }
    }

    let next = nextScheduleRepeatDate(
      currentRun,
      campaign.scheduleRepeatType,
      selectedMonths,
      completedMonths,
    );

    if (
      next &&
      campaign.endDate &&
      next.getTime() > new Date(campaign.endDate).getTime()
    ) {
      next = null;
    }

    const shouldRepeat = Boolean(next);

    const updated = await Campaign.findOneAndUpdate(
      {
        _id: campaign._id,
        status: "Running",
      },
      {
        $set: {
          sent,
          failed,
          delivered: 0,
          read: 0,

          status: shouldRepeat
            ? "Scheduled"
            : sent > 0
              ? "Completed"
              : "Failed",

          scheduledAt: shouldRepeat ? next : currentRun,

          nextRunAt: shouldRepeat ? next : null,

          scheduleCompletedMonths: completedMonths,

          completedAt: shouldRepeat ? null : new Date(),

          report: {
            total: items.length,
            sent,
            failed,
            results,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      },
    );

    if (!updated) {
      console.log(
        "[Schedule Scheduler] Campaign status changed:",
        String(campaign._id),
      );

      return;
    }

    console.log(
      "[Schedule Scheduler] Finished:",
      String(campaign._id),
      "Sent:",
      sent,
      "Failed:",
      failed,
      "Next:",
      next ? next.toISOString() : "No next run",
    );
  } catch (error) {
    console.error("[Schedule Scheduler] Error:", String(campaign._id), error);

    try {
      await Campaign.findOneAndUpdate(
        {
          _id: campaign._id,
          status: "Running",
        },
        {
          $set: {
            status: "Failed",
            nextRunAt: null,
            completedAt: new Date(),
          },
        },
      );
    } catch (updateError) {
      console.error(
        "[Schedule Scheduler] Failed to update campaign:",
        updateError,
      );
    }
  }
}
async function executeScheduleMemoryCampaign(campaign) {
  try {
    const contactIds = Array.isArray(campaign.contacts)
      ? campaign.contacts
      : [];

    const savedContacts = (store.contacts || []).filter(
      (contact) =>
        contactIds.some((id) => String(id) === String(contact._id)) &&
        String(contact.createdBy) === String(campaign.createdBy) &&
        contact.status !== "Unsubscribed",
    );

    const directRecipients = Array.isArray(campaign.directRecipients)
      ? campaign.directRecipients
      : [];

    const recipients = [...savedContacts, ...directRecipients];

    const devices =
      Array.isArray(campaign.deviceIds) && campaign.deviceIds.length > 0
        ? campaign.deviceIds
        : campaign.device
          ? [campaign.device]
          : [];

    if (!recipients.length || !devices.length) {
      campaign.status = "Failed";

      campaign.failed = recipients.length || campaign.recipients || 0;

      campaign.nextRunAt = null;

      campaign.completedAt = new Date().toISOString();

      return;
    }

    const items = recipients.map((contact) => ({
      phone: contact.phone || contact.number,

      jid: contact.whatsappId || contact.jid,

      contact,

      message: campaign.message || "",

      sendText: campaign.sendText !== false,

      mediaFiles: campaign.mediaFiles || [],
    }));

    const result = await messageService.sendBulk(items, devices);

    const results = Array.isArray(result?.results) ? result.results : [];

    const sent = results.filter((item) => item.ok === true).length;

    const failed = Math.max(0, items.length - sent);

    campaign.sent = sent;
    campaign.failed = failed;

    campaign.report = {
      total: items.length,
      sent,
      failed,
      results,
    };

    if (campaign.status === "Stopped") {
      campaign.nextRunAt = null;

      campaign.updatedAt = new Date().toISOString();

      return;
    }

    const currentRun = new Date(campaign.scheduledAt);

    if (Number.isNaN(currentRun.getTime())) {
      campaign.status = "Failed";
      campaign.nextRunAt = null;

      campaign.completedAt = new Date().toISOString();

      return;
    }

    const selectedMonths = Array.isArray(campaign.scheduleRepeatMonths)
      ? campaign.scheduleRepeatMonths.map(Number)
      : [];

    const completedMonths = [
      ...new Set(
        Array.isArray(campaign.scheduleCompletedMonths)
          ? campaign.scheduleCompletedMonths.map(Number)
          : [],
      ),
    ];

    if (campaign.scheduleRepeatType === "MONTHLY") {
      const currentMonth = currentRun.getUTCMonth() + 1;

      if (
        selectedMonths.includes(currentMonth) &&
        !completedMonths.includes(currentMonth)
      ) {
        completedMonths.push(currentMonth);
      }
    }

    let next = nextScheduleRepeatDate(
      currentRun,
      campaign.scheduleRepeatType,
      selectedMonths,
      completedMonths,
    );

    if (
      next &&
      campaign.endDate &&
      next.getTime() > new Date(campaign.endDate).getTime()
    ) {
      next = null;
    }

    campaign.scheduleCompletedMonths = completedMonths;

    campaign.status = next ? "Scheduled" : sent > 0 ? "Completed" : "Failed";

    campaign.scheduledAt = next ? next.toISOString() : campaign.scheduledAt;

    campaign.nextRunAt = next ? next.toISOString() : null;

    campaign.completedAt = next ? null : new Date().toISOString();

    campaign.updatedAt = new Date().toISOString();

    console.log(
      "[Schedule Scheduler] Memory finished:",
      String(campaign._id),
      "Next:",
      next ? next.toISOString() : "No next run",
    );
  } catch (error) {
    console.error("[Schedule Scheduler] Memory error:", error);

    if (campaign.status !== "Stopped") {
      campaign.status = "Failed";

      campaign.nextRunAt = null;

      campaign.completedAt = new Date().toISOString();
    }
  }
}
async function executeBulkMongoCampaign(campaign) {
  try {
    console.log("[Bulk Scheduler] Sending campaign:", campaign._id.toString());

    const dbRecipients = await Contact.find({
      _id: { $in: campaign.contacts || [] },
      status: { $ne: "Unsubscribed" },
    }).lean();

    const directRecipients = Array.isArray(campaign.directRecipients)
      ? campaign.directRecipients
      : [];

    const recipients = [...dbRecipients, ...directRecipients];

    console.log(
      "[Bulk Scheduler] DB recipients:",
      dbRecipients.length,
      "Direct recipients:",
      directRecipients.length,
      "Total:",
      recipients.length,
    );

    if (!recipients.length) {
      await Campaign.findByIdAndUpdate(campaign._id, {
        status: "Failed",
        failed: campaign.recipients || 0,
        completedAt: new Date(),
      });

      return;
    }

    const items = recipients.map((contact) => ({
      phone: contact.phone,
      jid: contact.whatsappId,
      contact,
      message: campaign.message || "",
      sendText: campaign.sendText !== false,
      mediaFiles: campaign.mediaFiles || [],
    }));

    const devices =
      Array.isArray(campaign.deviceIds) && campaign.deviceIds.length > 0
        ? campaign.deviceIds
        : campaign.device
          ? [campaign.device]
          : [];

    if (!devices.length) {
      await Campaign.findByIdAndUpdate(campaign._id, {
        status: "Failed",
        failed: items.length,
        completedAt: new Date(),
      });

      return;
    }

    console.log(
      "[Bulk Scheduler] Recipients:",
      items.length,
      "Devices:",
      devices.length,
    );

    const result = await messageService.sendBulk(items, devices);

    const results = result?.results || [];

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    // Current run
    const currentRun = new Date(campaign.scheduledAt || new Date());

    // Already completed monthly months
    let completedMonths = Array.isArray(campaign.bulkRepeatCompletedMonths)
      ? [
          ...new Set(
            campaign.bulkRepeatCompletedMonths
              .map(Number)
              .filter(
                (month) => Number.isInteger(month) && month >= 1 && month <= 12,
              ),
          ),
        ]
      : [];

    const selectedMonths = Array.isArray(campaign.bulkRepeatMonths)
      ? campaign.bulkRepeatMonths.map(Number)
      : [];

    // MONTHLY current month complete
    if (campaign.bulkRepeatType === "MONTHLY") {
      const currentMonth = currentRun.getMonth() + 1;

      if (
        selectedMonths.includes(currentMonth) &&
        !completedMonths.includes(currentMonth)
      ) {
        completedMonths.push(currentMonth);
      }
    }

    // Next run
    const next = nextBulkRepeatDate(
      currentRun,
      campaign.bulkRepeatType,
      campaign.bulkRepeatMonths || [],
      completedMonths,
    );

    const shouldRepeat = !!next;

    // User ne running ke time stop kiya ho
    const latestCampaign = await Campaign.findById(campaign._id).select(
      "status",
    );

    const wasStopped = latestCampaign?.status === "Stopped";

    if (wasStopped) {
      await Campaign.findByIdAndUpdate(campaign._id, {
        sent,
        failed,
        delivered: 0,
        read: 0,
        bulkRepeatCompletedMonths: completedMonths,
        nextRunAt: null,
        completedAt: new Date(),
        report: {
          total: items.length,
          sent,
          failed,
          results,
        },
      });

      console.log(
        "[Bulk Scheduler] Campaign stopped by user:",
        campaign._id.toString(),
      );

      return;
    }

    await Campaign.findByIdAndUpdate(campaign._id, {
      sent,
      failed,
      delivered: 0,
      read: 0,

      status: shouldRepeat ? "Scheduled" : sent > 0 ? "Completed" : "Failed",

      completedAt: shouldRepeat ? null : new Date(),

      scheduledAt: shouldRepeat ? next : campaign.scheduledAt,

      nextRunAt: shouldRepeat ? next : null,

      bulkRepeatCompletedMonths: completedMonths,

      report: {
        total: items.length,
        sent,
        failed,
        results,
      },
    });

    console.log(
      "[Bulk Scheduler] Campaign finished:",
      campaign._id.toString(),
      "Type:",
      campaign.bulkRepeatType,
      "Sent:",
      sent,
      "Failed:",
      failed,
      "Completed Months:",
      completedMonths,
      "Next:",
      shouldRepeat ? next.toISOString() : "No next run",
    );
  } catch (error) {
    console.error(
      "[Bulk Scheduler] Campaign execution error:",
      campaign._id?.toString(),
      error,
    );

    await Campaign.findByIdAndUpdate(campaign._id, {
      status: "Failed",
      completedAt: new Date(),
    });
  }
}

async function executeBulkMemoryCampaign(campaign) {
  try {
    const contactRecipients = Array.isArray(campaign.contacts)
      ? campaign.contacts
      : [];

    const directRecipients = Array.isArray(campaign.directRecipients)
      ? campaign.directRecipients
      : [];

    const recipients = [...contactRecipients, ...directRecipients];

    if (!recipients.length) {
      campaign.status = "Failed";
      campaign.failed = campaign.recipients || 0;
      campaign.completedAt = new Date().toISOString();

      return;
    }

    const items = recipients.map((contact) => ({
      phone: contact.phone,
      jid: contact.whatsappId,
      contact,
      message: campaign.message || "",
      sendText: campaign.sendText !== false,
      mediaFiles: campaign.mediaFiles || [],
    }));

    const devices =
      Array.isArray(campaign.deviceIds) && campaign.deviceIds.length > 0
        ? campaign.deviceIds
        : campaign.device
          ? [campaign.device]
          : [];

    if (!devices.length) {
      campaign.status = "Failed";
      campaign.failed = items.length;
      campaign.completedAt = new Date().toISOString();

      return;
    }

    const result = await messageService.sendBulk(items, devices);

    const results = result?.results || [];

    campaign.sent = results.filter((r) => r.ok).length;

    campaign.failed = results.length - campaign.sent;

    campaign.report = {
      total: items.length,
      sent: campaign.sent,
      failed: campaign.failed,
      results,
    };

    // Current run
    const currentRun = new Date(campaign.scheduledAt || new Date());

    // Completed monthly months
    let completedMonths = Array.isArray(campaign.bulkRepeatCompletedMonths)
      ? [
          ...new Set(
            campaign.bulkRepeatCompletedMonths
              .map(Number)
              .filter(
                (month) => Number.isInteger(month) && month >= 1 && month <= 12,
              ),
          ),
        ]
      : [];

    const selectedMonths = Array.isArray(campaign.bulkRepeatMonths)
      ? campaign.bulkRepeatMonths.map(Number)
      : [];

    // MONTHLY current month complete
    if (campaign.bulkRepeatType === "MONTHLY") {
      const currentMonth = currentRun.getMonth() + 1;

      if (
        selectedMonths.includes(currentMonth) &&
        !completedMonths.includes(currentMonth)
      ) {
        completedMonths.push(currentMonth);
      }
    }

    // Next run
    const next = nextBulkRepeatDate(
      currentRun,
      campaign.bulkRepeatType,
      campaign.bulkRepeatMonths || [],
      completedMonths,
    );

    const shouldRepeat = !!next;

    // Stop Schedule
    if (campaign.status === "Stopped") {
      campaign.bulkRepeatCompletedMonths = completedMonths;

      campaign.nextRunAt = null;
      campaign.completedAt = new Date().toISOString();

      return;
    }

    campaign.bulkRepeatCompletedMonths = completedMonths;

    campaign.status = shouldRepeat
      ? "Scheduled"
      : campaign.sent > 0
        ? "Completed"
        : "Failed";

    campaign.scheduledAt = shouldRepeat
      ? next.toISOString()
      : campaign.scheduledAt;

    campaign.nextRunAt = shouldRepeat ? next.toISOString() : null;

    campaign.completedAt = shouldRepeat ? null : new Date().toISOString();

    console.log(
      "[Bulk Scheduler] Memory campaign finished:",
      campaign._id?.toString?.() || campaign._id,
      "Type:",
      campaign.bulkRepeatType,
      "Sent:",
      campaign.sent,
      "Failed:",
      campaign.failed,
      "Completed Months:",
      completedMonths,
      "Next:",
      shouldRepeat ? next.toISOString() : "No next run",
    );
  } catch (error) {
    console.error("[Bulk Scheduler] Memory campaign error:", error);

    campaign.status = "Failed";
    campaign.completedAt = new Date().toISOString();
  }
}
async function executeMongoCampaign(campaign) {
  try {
    console.log(
      '[Scheduler] Sending campaign:',
      campaign._id.toString()
    );

   const dbRecipients = await Contact.find({
  _id: { $in: campaign.contacts || [] },
  status: { $ne: 'Unsubscribed' },
}).lean();

const directRecipients = Array.isArray(campaign.directRecipients)
  ? campaign.directRecipients
  : [];

const recipients = [
  ...dbRecipients,
  ...directRecipients,
];

console.log(
  '[Scheduler] DB recipients:',
  dbRecipients.length,
  'Direct recipients:',
  directRecipients.length,
  'Total:',
  recipients.length
);

    if (!recipients.length) {
      console.log('[Scheduler] No recipients found');

      await Campaign.findByIdAndUpdate(
        campaign._id,
        {
          status: 'Failed',
          failed: campaign.recipients || 0,
          completedAt: new Date(),
        }
      );

      return;
    }

    const items = recipients.map((contact) => ({
      phone: contact.phone,
      jid: contact.whatsappId,
      contact,
      message: campaign.message || '',
      sendText: campaign.sendText !== false,
      mediaFiles: campaign.mediaFiles || [],
    }));

    const devices =
      Array.isArray(campaign.deviceIds) &&
      campaign.deviceIds.length > 0
        ? campaign.deviceIds
        : campaign.device
          ? [campaign.device]
          : [];

    console.log(
      '[Scheduler] Recipients:',
      items.length,
      'Devices:',
      devices.length
    );

    const result = await messageService.sendBulk(
      items,
      devices
    );

    const results = result?.results || [];

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    const next = nextRepeatDate(
      campaign.scheduledAt || new Date(),
      campaign.repeat
    );

    const shouldRepeat =
      next &&
      (!campaign.endDate || next <= campaign.endDate);

    await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        sent,
        failed,
        delivered: 0,
        read: 0,

        status: shouldRepeat
          ? 'Scheduled'
          : sent > 0
            ? 'Completed'
            : 'Failed',

        completedAt: shouldRepeat
          ? null
          : new Date(),

        scheduledAt: shouldRepeat
          ? next
          : campaign.scheduledAt,

        nextRunAt: shouldRepeat
          ? next
          : null,

        report: {
          total: items.length,
          sent,
          failed,
          results,
        },
      }
    );

    console.log(
      '[Scheduler] Campaign finished:',
      campaign._id.toString(),
      'Sent:',
      sent,
      'Failed:',
      failed
    );

  } catch (error) {

    console.error(
      '[Scheduler] Campaign execution error:',
      campaign._id?.toString(),
      error
    );

    await Campaign.findByIdAndUpdate(
      campaign._id,
      {
        status: 'Failed',
        completedAt: new Date(),
      }
    );
  }
}

async function executeMemoryCampaign(campaign) {
  try {
    const recipients = Array.isArray(campaign.contacts)
      ? campaign.contacts
      : [];

    if (!recipients.length) {
      campaign.status = 'Failed';
      campaign.failed = campaign.recipients || 0;
      return;
    }

    const items = recipients.map((contact) => ({
      phone: contact.phone,
      jid: contact.whatsappId,
      contact,
      message: campaign.message || '',
      sendText: campaign.sendText !== false,
      mediaFiles: campaign.mediaFiles || [],
    }));

    const devices =
      Array.isArray(campaign.deviceIds) &&
      campaign.deviceIds.length
        ? campaign.deviceIds
        : campaign.device
          ? [campaign.device]
          : [];

    const result = await messageService.sendBulk(
      items,
      devices
    );

    const results = result?.results || [];

    campaign.sent = results.filter((r) => r.ok).length;
    campaign.failed = results.length - campaign.sent;

    campaign.report = {
      total: items.length,
      sent: campaign.sent,
      failed: campaign.failed,
      results,
    };

    const next = nextRepeatDate(
      campaign.scheduledAt || new Date(),
      campaign.repeat
    );

    const shouldRepeat =
      next &&
      (!campaign.endDate || next <= new Date(campaign.endDate));

    campaign.status = shouldRepeat
      ? 'Scheduled'
      : campaign.sent > 0
        ? 'Completed'
        : 'Failed';

    campaign.scheduledAt = shouldRepeat
      ? next.toISOString()
      : campaign.scheduledAt;

    campaign.nextRunAt = shouldRepeat
      ? next.toISOString()
      : null;

    campaign.completedAt = shouldRepeat
      ? null
      : new Date().toISOString();

  } catch (error) {
    console.error(
      '[Scheduler] Memory campaign error:',
      error
    );

    campaign.status = 'Failed';
    campaign.completedAt = new Date().toISOString();
  }
}

async function tick() {
  try {
    console.log(
      '[Scheduler] Checking campaigns:',
      new Date().toISOString()
    );

    if (isMongoConnected()) {

      const due = await Campaign.find({
        status: 'Scheduled',
        scheduledAt: {
          $ne: null,
          $lte: new Date(),
        },
      }).limit(10);

      console.log(
        '[Scheduler] Due campaigns:',
        due.length
      );

      for (const campaign of due) {

        /*
         * Atomic lock:
         * Scheduled -> Running
         *
         * Isse same campaign 2 baar execute nahi hoga.
         */
        const lockedCampaign =
          await Campaign.findOneAndUpdate(
            {
              _id: campaign._id,
              status: 'Scheduled',
            },
            {
              $set: {
                status: 'Running',
                startedAt: new Date(),
              },
            },
            {
              new: true,
            }
          );

        if (!lockedCampaign) {
          console.log(
            '[Scheduler] Already picked:',
            campaign._id.toString()
          );
          continue;
        }

        console.log(
          '[Scheduler] Executing:',
          lockedCampaign._id.toString()
        );

if (lockedCampaign.isBulkSchedule === true) {
  await executeBulkMongoCampaign(lockedCampaign);
} else if (
  ["15_DAYS", "WEEKLY", "MONTHLY"].includes(
    lockedCampaign.scheduleRepeatType,
  ) ||
  (lockedCampaign.scheduleRepeatType === "ONE_TIME" &&
    lockedCampaign.repeat === "No Repeat")
) {
  await executeScheduleMongoCampaign(lockedCampaign);
} else {
  await executeMongoCampaign(lockedCampaign);
}
      }

      return;
    }

    /*
     * Memory fallback
     */

    await init();

    const now = Date.now();

    const due = (store.campaigns || [])
      .filter(
        (campaign) =>
          campaign.status === 'Scheduled' &&
          campaign.scheduledAt &&
          new Date(campaign.scheduledAt).getTime() <= now
      )
      .slice(0, 10);

    console.log(
      '[Scheduler] Memory due campaigns:',
      due.length
    );

    for (const campaign of due) {

      campaign.status = 'Running';
      campaign.startedAt = new Date().toISOString();

      if (campaign.isBulkSchedule === true) {
        await executeBulkMemoryCampaign(campaign);
      } else if (
        ["15_DAYS", "WEEKLY", "MONTHLY"].includes(
          campaign.scheduleRepeatType,
        ) ||
        (campaign.scheduleRepeatType === "ONE_TIME" &&
          campaign.repeat === "No Repeat")
      ) {
        await executeScheduleMemoryCampaign(campaign);
      } else {
        await executeMemoryCampaign(campaign);
      }
    }

  } catch (error) {

    console.error(
      '[Scheduler] Tick error:',
      error
    );
  }
}

function startScheduler() {
  if (timer) {
    return;
  }

  console.log(
    '[Scheduler] campaign scheduler started (15s polling)'
  );

  timer = setInterval(() => {
    tick().catch((error) => {
      console.error(
        '[Scheduler] Interval error:',
        error
      );
    });
  }, 15000);

  tick().catch((error) => {
    console.error(
      '[Scheduler] Initial tick error:',
      error
    );
  });
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
  }

  timer = null;
}

module.exports = {
  startScheduler,
  stopScheduler,
  tick,
};