const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const wa = require('../controllers/waContactsController');

router.use(protect);
router.get('/session', wa.getSession);
router.get('/contacts', wa.getContacts);
router.post('/contacts/sync', wa.syncContacts);
router.get('/contacts/:id', wa.getContact);
router.post('/contacts/:id/note', wa.addNote);
router.delete('/contacts/:id/note/:noteId', wa.deleteNote);
router.post('/contacts/:id/schedule', wa.scheduleForContact);

module.exports = router;
