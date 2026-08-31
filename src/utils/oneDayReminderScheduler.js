const cron = require('node-cron');
const Contact = require('../models/Contact');
const messageService = require('../services/messageService');
const {
  store,
  init,
  isMongoConnected,
} = require('./memoryStore');

let reminderJob = null;

const processMongoReminders = async () => {
  const now = new Date();

  const reminders = await Contact.find({
    reminderAt: { $lte: now },
    reminderSentAt: null,
    status: { $nin: ['Blocked', 'Unsubscribed'] },
    phone: { $exists: true, $ne: '' },
    reminderMessage: { $exists: true, $ne: '' },
    reminderDeviceId: { $exists: true, $ne: '' },
  }).limit(100);

  for (const contact of reminders) {
    try {
      console.log(
        `[REMINDER] Processing contact ${contact._id} - ${contact.phone}`
      );

      const result = await messageService.sendOne(
        contact.reminderDeviceId,
        {
          phone: contact.phone,
          message: contact.reminderMessage,
          contact: contact.toObject(),
          sendText: true,
          mediaFiles: [],
        }
      );

      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            reminderSentAt: new Date(),
            lastMessagedAt: new Date(),
          },
        }
      );

      console.log(
        `[REMINDER] WhatsApp sent successfully to ${contact.phone}`,
        result?.key?.id || ''
      );
    } catch (error) {
      console.error(
        `[REMINDER] Failed for ${contact.phone}:`,
        error.message
      );

      // Keep reminderSentAt null so it can retry
      // on the next cron run.
    }
  }
};

const processMemoryReminders = async () => {
  await init();

  const now = new Date();

  const reminders = (store.contacts || []).filter((contact) => {
    if (!contact.reminderAt) return false;
    if (contact.reminderSentAt) return false;
    if (!contact.reminderMessage) return false;
    if (!contact.reminderDeviceId) return false;
    if (!contact.phone) return false;

    if (
      contact.status === 'Blocked' ||
      contact.status === 'Unsubscribed'
    ) {
      return false;
    }

    return new Date(contact.reminderAt) <= now;
  });

  for (const contact of reminders.slice(0, 100)) {
    try {
      console.log(
        `[REMINDER] Processing memory contact ${contact._id} - ${contact.phone}`
      );

      const result = await messageService.sendOne(
        contact.reminderDeviceId,
        {
          phone: contact.phone,
          message: contact.reminderMessage,
          contact,
          sendText: true,
          mediaFiles: [],
        }
      );

      contact.reminderSentAt = new Date().toISOString();
      contact.lastMessagedAt = new Date().toISOString();

      console.log(
        `[REMINDER] WhatsApp sent successfully to ${contact.phone}`,
        result?.key?.id || ''
      );
    } catch (error) {
      console.error(
        `[REMINDER] Failed for ${contact.phone}:`,
        error.message
      );
    }
  }
};

const processReminders = async () => {
  try {
    if (isMongoConnected()) {
      await processMongoReminders();
    } else {
      await processMemoryReminders();
    }
  } catch (error) {
    console.error(
      '[REMINDER] Scheduler error:',
      error.message
    );
  }
};

const startOneDayReminderScheduler = () => {
  if (reminderJob) {
    console.log('[REMINDER] Scheduler already running');
    return;
  }

  // Runs every minute
  reminderJob = cron.schedule('* * * * *', async () => {
    console.log(
      `[REMINDER] Checking reminders at ${new Date().toISOString()}`
    );

    await processReminders();
  });

  console.log(
    '[REMINDER] One-day WhatsApp reminder scheduler started'
  );
};

const stopOneDayReminderScheduler = () => {
  if (reminderJob) {
    reminderJob.stop();
    reminderJob = null;

    console.log(
      '[REMINDER] One-day WhatsApp reminder scheduler stopped'
    );
  }
};

module.exports = {
  startOneDayReminderScheduler,
  stopOneDayReminderScheduler,
  processReminders,
};