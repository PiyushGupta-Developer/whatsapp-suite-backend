// const express = require('express');
// const router = express.Router();
// const { protect } = require('../middleware/auth');
// const c = require('../controllers/contactController');

// router.use(protect);
// router.get('/', c.getContacts);
// router.get('/search', c.searchContacts);
// router.get('/:id', c.getContact);
// router.post('/', c.createContact);
// router.put('/:id', c.updateContact);
// router.post(
//   '/:id/one-day-reminder',
//   c.scheduleOneDayReminder
// );
// router.post('/bulk', c.bulkCreateContacts);
// router.post('/import-excel', c.uploadExcel.single('file'), c.importExcel);
// router.delete('/:id', c.deleteContact);

// module.exports = router;


const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');
const c = require('../controllers/contactController');

router.use(protect);

// Get all contacts
router.get('/', c.getContacts);

// Search contacts
router.get('/search', c.searchContacts);

// Get single contact
router.get('/:id', c.getContact);

// Create contact
router.post('/', c.createContact);

// Schedule 1-day-before WhatsApp reminder
router.post(
  '/:id/one-day-reminder',
  c.scheduleOneDayReminder
);

// Update contact
router.put('/:id', c.updateContact);

// Bulk create contacts
router.post('/bulk', c.bulkCreateContacts);

// Import contacts from Excel
router.post(
  '/import-excel',
  c.uploadExcel.single('file'),
  c.importExcel
);

// Delete contact
router.delete('/:id', c.deleteContact);

module.exports = router;