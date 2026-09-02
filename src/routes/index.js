const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const devices = require('../controllers/deviceController');
const campaigns = require('../controllers/campaignController');
const media = require('../controllers/mediaController');
const contacts = require('../controllers/contactController');
const m4 = require('../controllers/module4Controller');
const m5 = require('../controllers/module5Controller');
const tools = require('../controllers/toolsController');
const waContacts = require('../controllers/waContactsController');
const notifications = require('../controllers/notificationController');
const h = (fn, name) =>
  typeof fn === 'function'
    ? fn
    : (req, res) =>
        res.status(500).json({
          success: false,
          message: `Handler missing: ${name}`,
        });

// ============================================================
// AUTH
// ============================================================

router.post(
  '/auth/login',
  h(auth.login, 'auth.login')
);

router.post(
  '/auth/register',
  h(auth.register, 'auth.register')
);

router.get(
  '/auth/me',
  protect,
  h(auth.getMe, 'auth.getMe')
);

// ============================================================
// PROFILE / PERMISSIONS
// ============================================================

router.get(
  '/profile',
  protect,
  h(users.getProfile, 'users.getProfile')
);

router.put(
  '/profile',
  protect,
  h(users.updateProfile, 'users.updateProfile')
);

router.get(
  '/permissions',
  protect,
  h(users.getPermissions, 'users.getPermissions')
);

router.get(
  '/permissions/check/:perm',
  protect,
  h(users.checkPermission, 'users.checkPermission')
);

// ============================================================
// EMPLOYEES
// ============================================================

router.get(
  '/users',
  protect,
  authorize('Administrator', 'Manager'),
  h(users.getUsers, 'users.getUsers')
);

router.post(
  '/users',
  protect,
  authorize('Administrator'),
  h(users.createUser, 'users.createUser')
);

router.get(
  '/users/:id',
  protect,
  authorize('Administrator', 'Manager'),
  h(users.getUser, 'users.getUser')
);

router.put(
  '/users/:id',
  protect,
  authorize('Administrator'),
  h(users.updateUser, 'users.updateUser')
);

router.patch(
  '/users/:id/toggle-status',
  protect,
  authorize('Administrator'),
  h(users.toggleStatus, 'users.toggleStatus')
);

router.patch(
  '/users/:id/status',
  protect,
  authorize('Administrator'),
  h(users.setStatus, 'users.setStatus')
);

router.delete(
  '/users/:id',
  protect,
  authorize('Administrator'),
  h(users.deleteUser, 'users.deleteUser')
);

// ============================================================
// WHATSAPP DEVICES
// ============================================================

router.get(
  '/devices',
  protect,
  h(devices.getDevices, 'devices.getDevices')
);

router.post(
  '/devices',
  protect,
  authorize('Administrator', 'Manager', 'Operator'),
  h(devices.addDevice, 'devices.addDevice')
);

router.post(
  '/devices/:id/connect',
  protect,
  h(devices.connectDevice, 'devices.connectDevice')
);

router.get(
  '/devices/:id/qr',
  protect,
  h(devices.getQr, 'devices.getQr')
);

router.get(
  '/devices/:id/status',
  protect,
  h(devices.getDeviceStatus, 'devices.getDeviceStatus')
);

router.post(
  '/devices/:id/disconnect',
  protect,
  h(devices.disconnectDevice, 'devices.disconnectDevice')
);

router.put(
  '/devices/:id',
  protect,
  h(devices.updateDevice, 'devices.updateDevice')
);

router.delete(
  '/devices/:id',
  protect,
  authorize('Administrator', 'Manager'),
  h(devices.deleteDevice, 'devices.deleteDevice')
);

router.post(
  '/devices/:id/send',
  protect,
  h(devices.sendMessage, 'devices.sendMessage')
);

router.post(
  '/devices/:id/sendMessage',
  protect,
  h(devices.sendMessage, 'devices.sendMessage')
);

router.post(
  '/devices/:id/send-bulk',
  protect,
  h(devices.sendBulkMessages, 'devices.sendBulkMessages')
);

router.post(
  '/devices/:id/sendBulkMessages',
  protect,
  h(devices.sendBulkMessages, 'devices.sendBulkMessages')
);

// ============================================================
// QUICK SEND / BULK SEND
// ============================================================

router.post(
  '/messages/send',
  protect,
  h(devices.sendMessage, 'messages.send')
);
 
router.post(
  '/messages/bulk',
  protect,
  media.upload.array('files', 10),
  h(devices.sendBulkMessages, 'messages.bulk')
);
 
// ============================================================
// CAMPAIGNS + REPORT
// ============================================================

router.get(
  '/campaigns/dashboard',
  protect,
  h(campaigns.getDashboardStats, 'campaigns.dashboard')
);

router.get(
  '/campaigns',
  protect,
  h(campaigns.getCampaigns, 'campaigns.list')
);

router.post(
  '/campaigns',
  protect,
  authorize('Administrator', 'Manager', 'Operator'),
  h(campaigns.createCampaign, 'campaigns.create')
);

// ================================
// SCHEDULE API
// ================================
router.post(
  '/schedule',
  protect,
  authorize('Administrator', 'Manager', 'Operator'),
  media.upload.array('files', 10),
  h(campaigns.createCampaign, 'schedule')
);

// ================================
// BULK API
// ================================
router.post(
  '/bulk',
  protect,
  authorize('Administrator', 'Manager', 'Operator'),
  media.upload.array('files', 10),
  h(campaigns.createCampaign, 'bulk')
);

// ================================
// BULK SCHEDULE API
// ================================
router.post(
  '/bulk-schedule',
  protect,
  authorize('Administrator', 'Manager', 'Operator'),
  media.upload.array('files', 10),
  h(campaigns.createCampaign, 'bulk-schedule')
);

router.get(
  '/campaigns/:id',
  protect,
  h(campaigns.getCampaign, 'campaigns.get')
);

router.post(
  '/campaigns/:id/send',
  protect,
  h(campaigns.sendCampaign, 'campaigns.send')
);

router.get(
  '/campaigns/:id/report',
  protect,
  h(campaigns.getReport, 'campaigns.report')
);

router.put(
  '/campaigns/:id',
  protect,
  h(campaigns.updateCampaign, 'campaigns.update')
);

router.delete(
  '/campaigns/:id',
  protect,
  authorize('Administrator', 'Manager'),
  h(campaigns.deleteCampaign, 'campaigns.delete')
);

// ============================================================
// MEDIA
// ============================================================

router.get(
  '/media',
  protect,
  h(media.getMedia, 'media.list')
);

router.post(
  '/media',
  protect,
  media.upload.array('files', 10),
  h(media.uploadMedia, 'media.upload')
);

router.delete(
  '/media/:id',
  protect,
  h(media.deleteMedia, 'media.delete')
);

// ============================================================
// CONTACT MANAGEMENT + EXCEL IMPORT
// ============================================================

// done
router.get(
  '/contacts',
  protect,
  h(contacts.getContacts, 'contacts.list')
);

// done
router.get(
  '/contacts/search',
  protect,
  h(contacts.searchContacts, 'contacts.search')
);



router.get(
  '/contacts/tags',
  protect,
  h(contacts.getContactTags, 'contacts.tags')
);

router.get(
  '/contacts/stats',
  protect,
  h(contacts.getContactStats, 'contacts.stats')
);

// done
router.get(
  '/contacts/:id',
  protect,
  h(contacts.getContact, 'contacts.get')
);

// done
router.post(
  '/contacts',
  protect,
  h(contacts.createContact, 'contacts.create')
);

// ============================================================
// 1-DAY-BEFORE WHATSAPP REMINDER
// ============================================================

// done
router.post(
  '/contacts/:id/one-day-reminder',
  protect,
  h(
    contacts.scheduleOneDayReminder,
    'contacts.scheduleOneDayReminder'
  )
);


// done
router.put(
  '/contacts/:id',
  protect,
  h(contacts.updateContact, 'contacts.update')
);

//done
router.post(
  '/contacts/bulk',
  protect,
  h(contacts.bulkCreateContacts, 'contacts.bulk')
);



//done
router.post(
  '/contacts/import-excel',
  protect,
  contacts.uploadExcel.single('file'),
  h(contacts.importExcel, 'contacts.importExcel')
);


// done
router.delete(
  '/contacts/:id',
  protect,
  h(contacts.deleteContact, 'contacts.delete')
);

// done 
router.delete(
  '/contacts',
  protect,
  h(contacts.deleteAllContacts, 'contacts.deleteAll')
);

// done
router.get(
  '/contact-lists',
  protect,
  h(contacts.getLists, 'contacts.lists')
);

// done
router.post(
  '/contact-lists',
  protect,
  h(contacts.createList, 'contacts.createList')
);

// ============================================================
// NOTEBOOK / NOTES
// ============================================================

// done
router.get(
  '/notes',
  protect,
  h(tools.getNotes, 'notes.list')
);

// done
router.post(
  '/notes',
  protect,
  h(tools.createNote, 'notes.create')
);
//done
router.put(
  '/notes/:id',
  protect,
  h(tools.updateNote, 'notes.update')
);

// done
router.delete(
  '/notes/:id',
  protect,
  h(tools.deleteNote, 'notes.delete')
);

// ============================================================
// CALENDAR
// ============================================================

// done
router.get(
  '/calendar',
  protect,
  h(tools.getCalendar, 'calendar.list')
);

// ============================================================
// MODULE 4
// ============================================================

//done
router.get(
  '/m4/overview',
  protect,
  h(m4.getModuleOverview, 'm4.overview')
);

// done
router.get(
  '/variables',
  protect,
  h(m4.getVariables, 'm4.variables')
);

// done
router.post(
  '/variables',
  protect,
  h(m4.createVariable, 'm4.variableCreate')
);

// done
router.delete(
  '/variables/:key',
  protect,
  h(m4.deleteVariable, 'm4.variableDelete')
);

// done 
router.get(
  '/templates',
  protect,
  h(m4.getTemplates, 'm4.templates')
);
// done
router.post(
  '/templates',
  protect,
  h(m4.createTemplate, 'm4.templateCreate')
);
// done
router.put(
  '/templates/:id',
  protect,
  h(m4.updateTemplate, 'm4.templateUpdate')
);
// done
router.delete(
  '/templates/:id',
  protect,
  h(m4.deleteTemplate, 'm4.templateDelete')
);

// done
router.get(
  '/queue',
  protect,
  h(m4.getQueue, 'm4.queue')
);

// done
router.post(
  '/queue/:id/retry',
  protect,
  h(m4.retryQueueItem, 'm4.retry')
);

// done
router.post(
  '/queue/clear',
  protect,
  h(m4.clearQueue, 'm4.clearQueue')
);

// ============================================================
// BULK SEND / REPORTS
// ============================================================

// done
router.post(
  '/bulk-send',
  protect,
  media.upload.array('files',10),
  h(campaigns.createCampaign,'bulk-send')
);

// done
router.get(
  '/reports',
  protect,
  h(campaigns.getReports, 'campaigns.reports')
);

// ============================================================
// MODULE 5 - SCHEDULER / REMINDERS / RETRY
// ============================================================

//done 
router.get(
  '/m5/overview',
  protect,
  h(m5.getOverview, 'm5.overview')
);

// done
router.get(
  '/schedules',
  protect,
  h(m5.getSchedules, 'm5.schedules')
);

// done
router.post(
  '/schedules',
  protect,
  h(m5.createSchedule, 'm5.scheduleCreate')
);
// done
router.put(
  '/schedules/:id',
  protect,
  h(m5.updateSchedule, 'm5.scheduleUpdate')
);

// done
router.patch(
  '/schedules/:id/toggle',
  protect,
  h(m5.toggleSchedule, 'm5.scheduleToggle')
);

// done
router.post(
  '/schedules/:id/run',
  protect,
  h(m5.runScheduleNow, 'm5.scheduleRun')
);

//done
router.delete(
  '/schedules/:id',
  protect,
  h(m5.deleteSchedule, 'm5.scheduleDelete')
);
// done
router.get(
  '/cron/presets',
  protect,
  h(m5.getCronPresets, 'm5.presets')
);

// done
router.post(
  '/cron/validate',
  protect,
  h(m5.validateCron, 'm5.validate')
);

// done
router.get(
  '/cron/logs',
  protect,
  h(m5.getCronLogs, 'm5.logs')
);

// done
router.get(
  '/reminders',
  protect,
  h(m5.getReminders, 'm5.reminders')
);
// done
router.post(
  '/reminders',
  protect,
  h(m5.createReminder, 'm5.reminderCreate')
);
// done 
router.put(
  '/reminders/:id',
  protect,
  h(m5.updateReminder, 'm5.reminderUpdate')
);
// done
router.patch(
  '/reminders/:id/complete',
  protect,
  h(m5.completeReminder, 'm5.reminderComplete')
);

// done
router.delete(
  '/reminders/:id',
  protect,
  h(m5.deleteReminder, 'm5.reminderDelete')
);

// done
router.get(
  '/retry-policy',
  protect,
  h(m5.getRetryPolicy, 'm5.retryPolicy')
);

// done
router.put(
  '/retry-policy',
  protect,
  h(m5.updateRetryPolicy, 'm5.retryPolicyUpdate')
);

// done
router.post(
  '/retry/failed',
  protect,
  h(m5.retryFailed, 'm5.retryFailed')
);

// done
router.post(
  '/retry/:id',
  protect,
  h(m5.retryOne, 'm5.retryOne')
);

// ============================================================
// LIVE WHATSAPP CONTACTS / NOTEBOOK / SCHEDULE
// ============================================================

router.get(
  '/whatsapp/session',
  protect,
  h(waContacts.getSession, 'wa.session')
);

router.get(
  '/whatsapp/contacts',
  protect,
  h(waContacts.getContacts, 'wa.contacts')
);

router.post(
  '/whatsapp/contacts/sync',
  protect,
  h(waContacts.syncContacts, 'wa.sync')
);

router.get(
  '/whatsapp/contacts/:id',
  protect,
  h(waContacts.getContact, 'wa.contact')
);

router.post(
  '/whatsapp/contacts/:id/note',
  protect,
  h(waContacts.addNote, 'wa.note')
);

router.delete(
  '/whatsapp/contacts/:id/note/:noteId',
  protect,
  h(waContacts.deleteNote, 'wa.noteDelete')
);

router.post(
  '/whatsapp/contacts/:id/schedule',
  protect,
  h(waContacts.scheduleForContact, 'wa.schedule')
);

// NOTIFICATION 

router.get(
  '/notifications',
  protect,
  h(notifications.getNotifications, 'notifications.list')
);

router.patch(
  '/notifications/:id/read',
  protect,
  h(notifications.markAsRead, 'notifications.markAsRead')
);

router.patch(
  '/notifications/read-all',
  protect,
  h(notifications.markAllAsRead, 'notifications.markAllAsRead')
);
router.delete(
  '/notifications/:id',
  protect,
  h(notifications.deleteNotification, 'notifications.delete')
);

router.post(
  '/notifications',
  protect,
  h(notifications.createNotification, 'notifications.create')
);



module.exports = router;
