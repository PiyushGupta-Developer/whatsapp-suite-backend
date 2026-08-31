const Notification = require('../models/Notifications');
const Contact = require('../models/Contact');
const { store, init, isMongoConnected, uuidv4 } = require('../utils/memoryStore');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function formatDate(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  return `${String(ist.getUTCDate()).padStart(2, '0')}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${ist.getUTCFullYear()}`;
}

function formatTime(dateInput) {
  if (!dateInput) return null;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  let hours = ist.getUTCHours();
  const minutes = String(ist.getUTCMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
}

function extractMobile(notification) {
  return notification.mobile ||
    notification.phone ||
    notification.mobileNumber ||
    notification.meta?.phone ||
    notification.meta?.mobile ||
    notification.meta?.mobileNumber ||
    notification.meta?.contactPhone ||
    null;
}

function formatNotification(doc) {
  const n = doc && doc.toObject ? doc.toObject() : doc;
  return {
    _id: n._id,
    title: n.title,
    message: n.message,
    type: n.type || 'info',
    link: n.link || null,
    mobile: extractMobile(n),
    isRead: !!n.isRead,
    date: formatDate(n.createdAt),
    time: formatTime(n.createdAt),
  };
}

async function resolveContactPhone(id) {
  if (!id) return null;

  if (isMongoConnected()) {
    const contact = await Contact.findById(id).select('phone').lean();
    return contact?.phone || null;
  }

  await init();
  const contact = (store.contacts || []).find(c => String(c._id) === String(id));
  return contact?.phone || null;
}

async function formatNotificationsWithContactPhone(notifications) {
  return Promise.all(notifications.map(async notification => {
    const n = notification.toObject ? notification.toObject() : notification;
    let title = n.title;

    const match = typeof title === 'string'
      ? title.match(/Contact\s*#([A-Za-z0-9_-]{1,64})/i)
      : null;

    const contactId = match?.[1] || n.meta?.contactId || n.meta?.contact || null;

    if (contactId) {
      try {
        const phone = await resolveContactPhone(contactId);
        if (phone) {
          title = match
            ? title.replace(match[0], `Contact ${phone}`)
            : `Contact ${phone}`;
        }
      } catch (_) {}
    }

    return formatNotification({ ...n, title });
  }));
}

exports.getNotifications = async (req, res) => {
  try {
    let notifications;

    if (!isMongoConnected()) {
      await init();
      notifications = (store.notifications || [])
        .filter(n => String(n.userId) === String(req.user._id))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      notifications = await Notification.find({
        userId: req.user._id
      }).sort({ createdAt: -1 });
    }

    return res.status(200).json({
      success: true,
      data: await formatNotificationsWithContactPhone(notifications)
    });
  } catch (error) {
    console.error('[GET NOTIFICATIONS ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.createNotification = async (req, res) => {
  try {
    const { title, message, type, link, meta, userId, mobile } = req.body;

    if (!title || !message) {
      return res.status(400).json({
        success: false,
        message: 'Title and message are required'
      });
    }

    const notificationData = {
      userId: userId || req.user._id,
      title,
      message,
      type: type || 'info',
      link: link || null,
      meta: { ...(meta || {}), ...(mobile ? { phone: mobile } : {}) }
    };

    let notification;

    if (!isMongoConnected()) {
      await init();
      notification = {
        _id: `notif_${uuidv4()}`,
        ...notificationData,
        isRead: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      store.notifications.push(notification);
    } else {
      notification = await Notification.create(notificationData);
    }

    return res.status(201).json({
      success: true,
      message: 'Notification created',
      data: formatNotification(notification)
    });
  } catch (error) {
    console.error('[CREATE NOTIFICATION ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    let notification;

    if (!isMongoConnected()) {
      await init();
      notification = (store.notifications || []).find(
        n => String(n._id) === String(req.params.id) &&
             String(n.userId) === String(req.user._id)
      );
      if (notification) {
        notification.isRead = true;
        notification.updatedAt = new Date();
      }
    } else {
      notification = await Notification.findOne({
        _id: req.params.id,
        userId: req.user._id
      });
      if (notification) {
        notification.isRead = true;
        await notification.save();
      }
    }

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: formatNotification(notification)
    });
  } catch (error) {
    console.error('[MARK NOTIFICATION READ ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    let modifiedCount = 0;

    if (!isMongoConnected()) {
      await init();
      for (const n of store.notifications || []) {
        if (String(n.userId) === String(req.user._id) && !n.isRead) {
          n.isRead = true;
          n.updatedAt = new Date();
          modifiedCount++;
        }
      }
    } else {
      const result = await Notification.updateMany(
        { userId: req.user._id, isRead: false },
        { $set: { isRead: true } }
      );
      modifiedCount = result.modifiedCount;
    }

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount
    });
  } catch (error) {
    console.error('[MARK ALL NOTIFICATIONS READ ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    let notification;

    if (!isMongoConnected()) {
      await init();
      const index = (store.notifications || []).findIndex(
        n => String(n._id) === String(req.params.id) &&
             String(n.userId) === String(req.user._id)
      );

      if (index !== -1) {
        notification = store.notifications[index];
        store.notifications.splice(index, 1);
      }
    } else {
      notification = await Notification.findOneAndDelete({
        _id: req.params.id,
        userId: req.user._id
      });
    }

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted',
      data: formatNotification(notification)
    });
  } catch (error) {
    console.error('[DELETE NOTIFICATION ERROR]', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
