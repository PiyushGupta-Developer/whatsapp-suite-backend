const Note = require('../models/Note');
const Contact = require('../models/Contact');
const mongoose = require('mongoose');
const { store, init, isMongoConnected } = require('../utils/memoryStore');

async function listNotes(filter = {}) {
  if (isMongoConnected()) return Note.find(filter).sort({ date: 1, createdAt: -1 }).populate('contact', 'name phone');
  await init();
  return (store.notes || []).filter((n) => Object.entries(filter).every(([k, v]) => String(n[k]) === String(v))).sort((a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt));
}

exports.getNotes = async (req, res) => {
  try {
    const filter = {};
    if (req.query.contactId) filter.contactId = req.query.contactId;
    if (req.query.type && req.query.type !== 'All') filter.type = req.query.type;
    const notes = await listNotes(filter);
    res.json({ success: true, count: notes.length, data: notes });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createNote = async (req, res) => {
  try {
    const { contactId, title, content, type = 'note', date, metadata } = req.body;
    if (!content && !title) return res.status(400).json({ success: false, message: 'title or content required' });

    if (isMongoConnected()) {
      // contactId may be a frontend string (phone/custom ID), not always a MongoDB ObjectId.
      // Only query Contact by _id when it is a valid ObjectId; the original value is
      // still preserved in note.contactId for the frontend.
      const contact =
        contactId && mongoose.isValidObjectId(contactId)
          ? await Contact.findById(contactId)
          : null;

      const note = await Note.create({
        contact: contact?._id,
        contactId: contactId ? String(contactId) : undefined,
        title: title || 'Note',
        content: content || '',
        type,
        date: date ? new Date(date) : new Date(),
        metadata,
        createdBy: req.user?._id,
      });
      return res.status(201).json({ success: true, data: note });
    }

    await init();
    store.notes = store.notes || [];
    const note = {
      _id: `n${Date.now()}`,
      contactId: contactId ? String(contactId) : null,
      title: title || 'Note',
      content: content || '',
      type,
      date: date || new Date().toISOString(),
      metadata,
      completed: false,
      createdAt: new Date().toISOString(),
      createdBy: req.user?._id,
    };
    store.notes.unshift(note);
    res.status(201).json({ success: true, data: note });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.updateNote = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const note = await Note.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
      return res.json({ success: true, data: note });
    }
    await init();
    const note = (store.notes || []).find((n) => n._id === req.params.id);
    if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
    Object.assign(note, req.body);
    res.json({ success: true, data: note });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

exports.deleteNote = async (req, res) => {
  try {
    if (isMongoConnected()) {
      await Note.findByIdAndDelete(req.params.id);
      return res.json({ success: true, message: 'Note deleted' });
    }
    await init();
    store.notes = (store.notes || []).filter((n) => n._id !== req.params.id);
    res.json({ success: true, message: 'Note deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getCalendar = async (req, res) => {
  try {
    const from = req.query.from ? new Date(req.query.from) : new Date();
    const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 30 * 86400000);

    if (isMongoConnected()) {
      const [notes, contacts] = await Promise.all([
        Note.find({ date: { $gte: from, $lte: to } }).sort({ date: 1 }).populate('contact', 'name phone'),
        Contact.find({ $or: [{ date: { $gte: from, $lte: to } }, { meetingCallDate: { $gte: from, $lte: to } }] }).sort({ date: 1 }),
      ]);
      return res.json({
        success: true,
        data: [
          ...notes.map((n) => ({ _id: n._id, type: n.type, title: n.title, content: n.content, date: n.date, contact: n.contact })),
          ...contacts.filter((c) => c.date || c.meetingCallDate).map((c) => ({
            _id: `contact-${c._id}`, type: 'contact', title: c.name || c.phone, content: c.remark || '', date: c.date || c.meetingCallDate, contact: c,
          })),
        ],
      });
    }

    await init();
    const events = [
      ...(store.notes || []).filter((n) => n.date && new Date(n.date) >= from && new Date(n.date) <= to),
      ...store.contacts.filter((c) => (c.date || c.meetingCallDate) && new Date(c.date || c.meetingCallDate) >= from && new Date(c.date || c.meetingCallDate) <= to)
        .map((c) => ({ _id: `contact-${c._id}`, type: 'contact', title: c.name || c.phone, content: c.remark || '', date: c.date || c.meetingCallDate, contact: c })),
    ];
    res.json({ success: true, data: events.sort((a, b) => new Date(a.date) - new Date(b.date)) });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
};

module.exports = exports;
