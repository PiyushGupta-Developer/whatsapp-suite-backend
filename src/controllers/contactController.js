const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');
const Contact = require('../models/Contact');
const ContactList = require('../models/ContactList');
const Note = require('../models/Note');
const { store, init, isMongoConnected } = require('../utils/memoryStore');

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
exports.uploadExcel = excelUpload;

function keyOf(row, aliases) {
  const keys = Object.keys(row || {});
  const found = keys.find((k) => aliases.includes(String(k).trim().toLowerCase()));
  return found ? row[found] : undefined;
}

function parseExcelDate(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0));
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseReminderDate(row) {
  const explicit = keyOf(row, ['reminderat', 'reminder date', 'reminder_date']);
  const dateValue = explicit ?? keyOf(row, [
    'date', 'meeting/call date', 'meeting call date', 'meeting date',
    'call date', 'meetingcall date', 'follow up date', 'follow-up date',
  ]);

  let date = parseExcelDate(dateValue);
  // The office requirement also mentions a Date being supplied in the Remark column.
  if (!date) {
    const remark = keyOf(row, ['remark', 'remarks', 'remark column']);
    date = parseExcelDate(remark);
  }
  if (!date) return null;

  const reminderAt = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return { date, reminderAt };
}

function normaliseContactRow(row) {
  const reminder = parseReminderDate(row);
  const name = keyOf(row, ['name', 'contact name', 'customer name']);
  const phone = keyOf(row, ['phone', 'phone number', 'mobile', 'mobile number', 'number']);
  const architectName = keyOf(row, ['architect name', 'architect']);
  const firmName = keyOf(row, ['firm name', 'firm', 'company']);
  const area = keyOf(row, ['area']);
  const address = keyOf(row, ['address']);
  const location = keyOf(row, ['location']);
  const email = keyOf(row, ['email', 'email address']);
  const requirement = keyOf(row, ['req', 'requirement', 'requirements']);
  const remark = keyOf(row, ['remark', 'remarks']);

  return {
    name: name || architectName || '',
    architectName: architectName || '',
    firmName: firmName || '',
    area: area || '',
    address: address || '',
    location: location || '',
    phone: String(phone || '').trim(),
    email: email || '',
    requirement: requirement || '',
    req: requirement || '',
    remark: remark || '',
    date: reminder?.date || null,
    meetingCallDate: reminder?.date || null,
    reminderAt: reminder?.reminderAt || null,
    status: 'Active',
  };
}

exports.uploadExcel = excelUpload;

exports.getContacts = async (req, res) => {
  try {
    const { search, page = 1, limit = 50, status } = req.query;
    const userId = req.user._id;

    if (isMongoConnected()) {
      const filter = {
        createdBy: userId,
      };

      if (status && status !== 'All') {
        filter.status = status;
      }

      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { architectName: { $regex: search, $options: 'i' } },
          { firmName: { $regex: search, $options: 'i' } },
          { area: { $regex: search, $options: 'i' } },
        ];
      }

      const p = Math.max(1, parseInt(page, 10));
      const l = Math.min(500, Math.max(1, parseInt(limit, 10)));

      const [contacts, total] = await Promise.all([
        Contact.find(filter)
          .skip((p - 1) * l)
          .limit(l)
          .sort({ createdAt: -1 }),

        Contact.countDocuments(filter),
      ]);

      return res.json({
        success: true,
        count: contacts.length,
        total,
        page: p,
        pages: Math.ceil(total / l),
        data: contacts,
      });
    }

    // MEMORY MODE
    await init();

    let list = store.contacts.filter(
      (c) => String(c.createdBy) === String(userId)
    );

    if (status && status !== 'All') {
      list = list.filter((c) => c.status === status);
    }

    if (search) {
      const s = search.toLowerCase();

      list = list.filter((c) =>
        [
          c.name,
          c.phone,
          c.architectName,
          c.firmName,
          c.area,
        ].some((v) =>
          String(v || '').toLowerCase().includes(s)
        )
      );
    }

    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(500, Math.max(1, parseInt(limit, 10)));
    const start = (p - 1) * l;

    return res.json({
      success: true,
      count: Math.min(
        l,
        list.length - start < 0 ? 0 : list.length - start
      ),
      total: list.length,
      page: p,
      pages: Math.ceil(list.length / l),
      data: list.slice(start, start + l),
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getContact = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const contact = await Contact.findOne({
        _id: req.params.id,
        createdBy: userId,
      });

      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
      }

      const notes = await Note.find({
        $and: [
          {
            $or: [
              { contact: contact._id },
              { contactId: String(contact._id) },
            ],
          },
          {
            createdBy: userId,
          },
        ],
      }).sort({ createdAt: -1 });

      return res.json({
        success: true,
        data: {
          ...contact.toObject(),
          notes,
        },
      });
    }

    // MEMORY MODE
    await init();

    const contact = store.contacts.find(
      (c) =>
        String(c._id) === String(req.params.id) &&
        String(c.createdBy) === String(userId)
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    const notes = (store.notes || []).filter(
      (n) =>
        String(n.contactId || n.contact) === String(req.params.id) &&
        String(n.createdBy) === String(userId)
    );

    return res.json({
      success: true,
      data: {
        ...contact,
        notes,
      },
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.createContact = async (req, res) => {
  try {
    const payload = {
  ...req.body,
  createdBy: req.user._id,
};
    if (!payload.phone) return res.status(400).json({ success: false, message: 'phone is required' });
    if (isMongoConnected()) {
      const contact = await Contact.create(payload);
      return res.status(201).json({ success: true, data: contact });
    }
    await init();
    const contact = { _id: `ct${Date.now()}`, createdAt: new Date().toISOString(), ...payload };
    store.contacts.push(contact);
    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updateContact = async (req, res) => {
  try {
    const userId = req.user._id;

    // User kisi aur user ko owner nahi bana sakta
    delete req.body.createdBy;

    if (isMongoConnected()) {
      const contact = await Contact.findOneAndUpdate(
        {
          _id: req.params.id,
          createdBy: userId,
        },
        req.body,
        {
          new: true,
          runValidators: true,
        }
      );

      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
      }

      return res.json({
        success: true,
        data: contact,
        message: 'Contact updated',
      });
    }

    // MEMORY MODE
    await init();

    const contact = store.contacts.find(
      (c) =>
        String(c._id) === String(req.params.id) &&
        String(c.createdBy) === String(userId)
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    Object.assign(contact, req.body, {
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      data: contact,
      message: 'Contact updated',
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
exports.bulkCreateContacts = async (req, res) => {
  try {
    const { contacts } = req.body;
    const userId = req.user._id;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Contacts array required',
      });
    }

    const docs = contacts.map((c) => ({
      ...c,
      createdBy: userId,
    }));

    if (isMongoConnected()) {
      const result = await Contact.insertMany(docs, {
        ordered: false,
      });

      return res.status(201).json({
        success: true,
        count: result.length,
        data: result,
      });
    }

    await init();

    const created = docs.map((c, i) => ({
      _id: `ct${Date.now()}${i}`,
      createdAt: new Date().toISOString(),
      ...c,
    }));

    store.contacts.push(...created);

    return res.status(201).json({
      success: true,
      count: created.length,
      data: created,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

function findColumn(row, aliases) {
  const keys = Object.keys(row || {});
  const normalize = (s) =>
    String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/');

  const found = keys.find((k) => aliases.includes(normalize(k)));
  return found ? row[found] : undefined;
}

exports.importExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Excel file is required (field: file)',
      });
    }
    const workbook = XLSX.read(req.file.buffer, {
      type: 'buffer',
      cellDates: true,
    });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'Excel sheet not found' });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'Excel file contains no data rows' });
    }

    console.log('========================================');
    console.log('[Excel] Headers found:', Object.keys(rows[0]));
    console.log('[Excel] First row:', rows[0]);
    console.log('========================================');

    const clean = (value) => (value === undefined || value === null ? '' : String(value).trim());

    const parseDate = (value) => {
      if (value === undefined || value === null || value === '') return null;

      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }

      if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (!parsed) return null;
        return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, parsed.S || 0);
      }

      const text = String(value).trim();

      // DD/MM/YYYY
      let m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
      }

      // DD-MM-YYYY
      m = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
      if (m) {
        const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return date;
      }

      // YYYY-MM-DD
      m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) return date;
      }

      const parsed = new Date(text);
      return isNaN(parsed.getTime()) ? null : parsed;
    };

    const extractDateFromRemark = (remark) => {
      if (!remark) return null;
      const match = String(remark).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      return match ? parseDate(`${match[1]}/${match[2]}/${match[3]}`) : null;
    };

    const getReminderDate = (date, meetingCallDate, remark) => {
      const sourceDate = date || meetingCallDate || extractDateFromRemark(remark);
      if (!sourceDate) return null;
      const reminderDate = new Date(sourceDate);
      reminderDate.setDate(reminderDate.getDate() - 1);
      return reminderDate;
    };

    // ============================================================
    // 4. NORMALISE EXCEL ROWS (flexible header aliases)
    // ============================================================
    const contacts = [];

    rows.forEach((row, index) => {
      try {
        const name = clean(findColumn(row, ['name', 'contact name', 'customer name']));
        const phoneRaw = findColumn(row, ['phone', 'phone number', 'mobile', 'mobile number', 'number']);
        const phone = clean(phoneRaw).replace(/\D/g, '');

        const architectName = clean(findColumn(row, ['architect name', 'architect']));
        const firmName = clean(findColumn(row, ['firm name', 'firm', 'company']));
        const area = clean(findColumn(row, ['area']));
        const address = clean(findColumn(row, ['address']));
        const location = clean(findColumn(row, ['location']));

        const dateValue = findColumn(row, ['date']);
        const meetingCallDateValue = findColumn(row, ['meeting/call date', 'meeting call date']);

        const reqVal = clean(findColumn(row, ['req']));
        const requirement = clean(findColumn(row, ['requirement', 'requirements']));
        const email = clean(findColumn(row, ['email', 'email address']));
        const remark = clean(findColumn(row, ['remark', 'remarks']));

        const date = parseDate(dateValue);
        const meetingCallDate = parseDate(meetingCallDateValue);
        const reminderAt = getReminderDate(date, meetingCallDate, remark);

        console.log(`[Excel] Row ${index + 2}`, {
          name, phone,
          excelDate: dateValue,
          excelMeetingCallDate: meetingCallDateValue,
          date, meetingCallDate, reminderAt,
        });

        if (!phone) {
          console.warn(`[Excel] Row ${index + 2}: phone missing, skipping`);
          return;
        }

        contacts.push({
          name: name || architectName || '',
          phone,
          architectName,
          firmName,
          area,
          address,
          location,
          date,
          meetingCallDate,
          req: reqVal,
          requirement,
          email,
          remark,
          reminderAt,
          status: 'Active',
          lists: [],
          tags: [],
        });
      } catch (error) {
        console.warn(`[Excel] Row ${index + 2} skipped:`, error.message);
      }
    });

    // ============================================================
    // 5. VALIDATION
    // ============================================================
    if (!contacts.length) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows with phone number found.',
      });
    }

    // ============================================================
    // 6. SAVE
    // ============================================================
    const createdBy = req.user._id;
    const created = [];
    let remindersCreated = 0;

    if (isMongoConnected()) {
      for (const payload of contacts) {
        const updateData = {
          name: payload.name,
          phone: payload.phone,
          architectName: payload.architectName,
          firmName: payload.firmName,
          area: payload.area,
          address: payload.address,
          location: payload.location,
          date: payload.date,
          meetingCallDate: payload.meetingCallDate,
          req: payload.req,
          requirement: payload.requirement,
          email: payload.email,
          remark: payload.remark,
          reminderAt: payload.reminderAt,
          status: payload.status,
          lists: payload.lists,
          tags: payload.tags,
          updatedAt: new Date(),
        };

        const update = { $set: updateData };
        if (createdBy) {
          update.$setOnInsert = { createdBy, createdAt: new Date() };
        }

        const contact = await Contact.findOneAndUpdate(
  {
    phone: payload.phone,
    createdBy: createdBy,
  },
  update,
  {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }
);
        created.push(contact);

        if (payload.reminderAt) {
          await Note.create({
            contact: contact._id,
            contactId: String(contact._id),
            title: `Follow-up reminder: ${contact.name || contact.phone}`,
            content: payload.remark || 'Imported Excel reminder',
            type: 'reminder',
            date: payload.reminderAt,
            completed: false,
            createdBy,
          });
          remindersCreated++;
        }
      }
    } else {
      await init();

      for (const payload of contacts) {
        let contact = store.contacts.find(
  (c) =>
    c.phone === payload.phone &&
    String(c.createdBy) === String(createdBy)
);

        if (!contact) {
          contact = {
            _id: `ct${Date.now()}${Math.random()}`,
            createdAt: new Date().toISOString(),
            ...(createdBy ? { createdBy } : {}),
          };
          store.contacts.push(contact);
        }

        Object.assign(contact, payload, { updatedAt: new Date().toISOString() });
        created.push(contact);

        if (payload.reminderAt) {
          store.notes = store.notes || [];
          store.notes.unshift({
            _id: `n${Date.now()}${Math.random()}`,
            contactId: String(contact._id),
            title: `Follow-up reminder: ${contact.name || contact.phone}`,
            content: payload.remark || 'Imported Excel reminder',
            type: 'reminder',
            date: payload.reminderAt,
            completed: false,
            createdAt: new Date().toISOString(),
            ...(createdBy ? { createdBy } : {}),
          });
          remindersCreated++;
        }
      }
    }

    // ============================================================
    // 7. RESPONSE
    // ============================================================
    return res.status(201).json({
      success: true,
      count: created.length,
      remindersCreated,
      reminderRule: 'Reminder is created exactly 1 day before Date/Meeting Call Date. A date found in Remark is also accepted.',
      data: created,
    });
  } catch (error) {
    console.error('[Excel Import Error]', error);
    return res.status(400).json({
      success: false,
      message: `Excel import failed: ${error.message}`,
    });
  }
};
exports.searchContacts = async (req, res) => {
  req.query.search = req.query.q || req.query.search || '';
  return exports.getContacts(req, res);
};

exports.deleteContact = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const deleted = await Contact.findOneAndDelete({
        _id: req.params.id,
        createdBy: userId,
      });

      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
      }

      return res.json({
        success: true,
        message: 'Contact deleted',
      });
    }

    await init();

    const idx = store.contacts.findIndex(
      (c) =>
        String(c._id) === String(req.params.id) &&
        String(c.createdBy) === String(userId)
    );

    if (idx < 0) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    store.contacts.splice(idx, 1);

    return res.json({
      success: true,
      message: 'Contact deleted',
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// 001 code delete 
exports.deleteAllContacts = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const result = await Contact.deleteMany({
        createdBy: userId,
      });

      return res.status(200).json({
        success: true,
        message: 'All your contacts deleted successfully',
        deletedCount: result.deletedCount,
      });
    }

    // MEMORY MODE
    await init();

    const beforeCount = store.contacts.length;

    store.contacts = store.contacts.filter(
      (c) => String(c.createdBy) !== String(userId)
    );

    const deletedCount =
      beforeCount - store.contacts.length;

    return res.status(200).json({
      success: true,
      message: 'All your contacts deleted successfully',
      deletedCount,
    });

  } catch (error) {
    console.error('[DELETE ALL CONTACTS ERROR]', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getLists = async (req, res) => {
  try {
    const userId = req.user._id;

    // MongoDB Mode
    if (isMongoConnected()) {
      const lists = await ContactList.find({
        createdBy: userId,
      }).sort({
        createdAt: -1,
      });

      return res.status(200).json({
        success: true,
        data: lists,
      });
    }

    // Memory Mode
    await init();

    const lists = (store.contactLists || []).filter(
      (list) =>
        String(list.createdBy) === String(userId)
    );

    return res.status(200).json({
      success: true,
      data: lists,
    });

  } catch (error) {
    console.error('[GET LISTS ERROR]', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.createList = async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ success: false, message: 'name required' });
    if (isMongoConnected()) return res.status(201).json({ success: true, data: await ContactList.create({ ...req.body, createdBy: req.user?._id }) });
    await init();
    store.contactLists = store.contactLists || [];
    const list = {
  _id: `l${Date.now()}`,
  ...req.body,
  createdBy: req.user._id,
  createdAt: new Date().toISOString(),
};
    store.contactLists.unshift(list);
    res.status(201).json({ success: true, data: list });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.scheduleOneDayReminder = async (req, res) => {
  try {
    const { eventDate, message, deviceId } = req.body;

    // ---------------------------------------------------------
    // VALIDATION
    // ---------------------------------------------------------

    if (!eventDate) {
      return res.status(400).json({
        success: false,
        message: 'eventDate is required',
      });
    }

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'message is required',
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'deviceId is required',
      });
    }

    // ---------------------------------------------------------
    // EVENT DATE
    // ---------------------------------------------------------

    const event = new Date(eventDate);

    if (Number.isNaN(event.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid eventDate',
      });
    }

    // ---------------------------------------------------------
    // EXACTLY 24 HOURS BEFORE EVENT
    // ---------------------------------------------------------

    const reminderAt = new Date(
      event.getTime() - 24 * 60 * 60 * 1000
    );

    // ---------------------------------------------------------
    // FIND CONTACT
    // ---------------------------------------------------------

    if (isMongoConnected()) {
      const contact = await Contact.findOne({
  _id: req.params.id,
  createdBy: req.user._id,
});

      if (!contact) {
        return res.status(404).json({
          success: false,
          message: 'Contact not found',
        });
      }

      if (!contact.phone) {
        return res.status(400).json({
          success: false,
          message: 'Contact phone number not found',
        });
      }

      contact.date = event;
      contact.meetingCallDate = event;
      contact.reminderAt = reminderAt;
      contact.reminderSentAt = null;
      contact.reminderMessage = message;
      contact.reminderDeviceId = String(deviceId);

      await contact.save();

      return res.status(201).json({
        success: true,
        message:
          '1-day WhatsApp reminder scheduled successfully',
        data: {
          contactId: contact._id,
          contactName: contact.name,
          phone: contact.phone,
          eventDate: event.toISOString(),
          reminderAt: reminderAt.toISOString(),
          deviceId: String(deviceId),
          reminderMessage: message,
        },
      });
    }

    // ---------------------------------------------------------
    // MEMORY MODE
    // ---------------------------------------------------------

    await init();

   const contact = store.contacts.find(
  (c) =>
    String(c._id) === String(req.params.id) &&
    String(c.createdBy) === String(req.user._id)
);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found',
      });
    }

    if (!contact.phone) {
      return res.status(400).json({
        success: false,
        message: 'Contact phone number not found',
      });
    }

    contact.date = event.toISOString();
    contact.meetingCallDate = event.toISOString();
    contact.reminderAt = reminderAt.toISOString();
    contact.reminderSentAt = null;
    contact.reminderMessage = message;
    contact.reminderDeviceId = String(deviceId);
    contact.updatedAt = new Date().toISOString();

    return res.status(201).json({
      success: true,
      message:
        '1-day WhatsApp reminder scheduled successfully',
      data: {
        contactId: contact._id,
        contactName: contact.name,
        phone: contact.phone,
        eventDate: event.toISOString(),
        reminderAt: reminderAt.toISOString(),
        deviceId: String(deviceId),
        reminderMessage: message,
      },
    });
  } catch (error) {
    console.error(
      '[REMINDER API ERROR]',
      error
    );

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// ============================================
// BULK 1-DAY-BEFORE WHATSAPP REMINDER
// ============================================

exports.scheduleBulkOneDayReminder = async (req, res) => {
  try {
    const {
      contactIds,
      eventDate,
      message,
      deviceId,
    } = req.body;

    // Validation
    if (
      !Array.isArray(contactIds) ||
      contactIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please select at least one contact',
      });
    }

    if (!eventDate) {
      return res.status(400).json({
        success: false,
        message: 'Event date is required',
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Reminder message is required',
      });
    }

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp device is required',
      });
    }

    // Parse event date
    const event = new Date(eventDate);

    if (Number.isNaN(event.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event date',
      });
    }

    // Event must be in future
    if (event <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Event date must be in the future',
      });
    }

    // Calculate reminder exactly 24 hours before
    const reminderAt = new Date(
      event.getTime() - 24 * 60 * 60 * 1000
    );

    // Update all selected contacts
    const result = await Contact.updateMany(
      {
        _id: { $in: contactIds },
        status: {
          $nin: ['Blocked', 'Unsubscribed'],
        },
      },
      {
        $set: {
          date: event,
          meetingCallDate: event,
          reminderAt,
          reminderSentAt: null,
          reminderMessage: message.trim(),
          reminderDeviceId: deviceId,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Reminder scheduled successfully',
      data: {
        selectedContacts: contactIds.length,
        updatedContacts: result.modifiedCount,
        eventDate: event,
        reminderAt,
        deviceId,
      },
    });

  } catch (error) {
    console.error(
      '[BULK REMINDER] Error:',
      error.message
    );

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to schedule reminder',
    });
  }
};


exports.getContactTags = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const tags = await Contact.aggregate([
        {
          $match: {
            createdBy: userId,
          },
        },
        {
          $unwind: '$tags',
        },
        {
          $group: {
            _id: '$tags',
          },
        },
        {
          $sort: {
            _id: 1,
          },
        },
      ]);

      return res.status(200).json({
        success: true,
        data: tags.map((item) => item._id),
      });
    }

    // MEMORY MODE
    await init();

    const tags = [
      ...new Set(
        store.contacts
          .filter(
            (contact) =>
              String(contact.createdBy) ===
              String(userId)
          )
          .flatMap((contact) =>
            Array.isArray(contact.tags)
              ? contact.tags
              : []
          )
      ),
    ].sort();

    return res.status(200).json({
      success: true,
      data: tags,
    });

  } catch (error) {
    console.error('[GET CONTACT TAGS ERROR]', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getContactStats = async (req, res) => {
  try {
    const userId = req.user._id;

    if (isMongoConnected()) {
      const baseFilter = {
        createdBy: userId,
      };

      const [
        totalContacts,
        withEmail,
        withPhone,
        withTags,
      ] = await Promise.all([
        Contact.countDocuments(baseFilter),

        Contact.countDocuments({
          ...baseFilter,
          email: {
            $exists: true,
            $ne: '',
          },
        }),

        Contact.countDocuments({
          ...baseFilter,
          phone: {
            $exists: true,
            $ne: '',
          },
        }),

        Contact.countDocuments({
          ...baseFilter,
          tags: {
            $exists: true,
            $ne: [],
          },
        }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalContacts,
          withEmail,
          withPhone,
          withTags,
        },
      });
    }

    // MEMORY MODE
    await init();

    const contacts = store.contacts.filter(
      (contact) =>
        String(contact.createdBy) === String(userId)
    );

    const totalContacts = contacts.length;

    const withEmail = contacts.filter(
      (c) => c.email
    ).length;

    const withPhone = contacts.filter(
      (c) => c.phone
    ).length;

    const withTags = contacts.filter(
      (c) =>
        Array.isArray(c.tags) &&
        c.tags.length > 0
    ).length;

    return res.status(200).json({
      success: true,
      data: {
        totalContacts,
        withEmail,
        withPhone,
        withTags,
      },
    });

  } catch (error) {
    console.error('[GET CONTACT STATS ERROR]', error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};