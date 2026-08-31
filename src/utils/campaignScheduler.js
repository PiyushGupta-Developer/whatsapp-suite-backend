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

        await executeMongoCampaign(lockedCampaign);
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

      await executeMemoryCampaign(campaign);
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