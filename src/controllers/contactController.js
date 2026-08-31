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
    if (isMongoConnected()) {
      const filter = {};
      if (status && status !== 'All') filter.status = status;
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
        Contact.find(filter).skip((p - 1) * l).limit(l).sort({ createdAt: -1 }),
        Contact.countDocuments(filter),
      ]);
      return res.json({ success: true, count: contacts.length, total, page: p, pages: Math.ceil(total / l), data: contacts });
    }

    await init();
    let list = [...store.contacts];
    if (status && status !== 'All') list = list.filter((c) => c.status === status);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((c) =>
        [c.name, c.phone, c.architectName, c.firmName, c.area].some((v) => String(v || '').toLowerCase().includes(s))
      );
    }
    const p = Math.max(1, parseInt(page, 10));
    const l = Math.min(500, Math.max(1, parseInt(limit, 10)));
    const start = (p - 1) * l;
    res.json({ success: true, count: Math.min(l, list.length - start < 0 ? 0 : list.length - start), total: list.length, page: p, pages: Math.ceil(list.length / l), data: list.slice(start, start + l) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getContact = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const contact = await Contact.findById(req.params.id);
      if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
      const notes = await Note.find({ $or: [{ contact: contact._id }, { contactId: String(contact._id) }] }).sort({ createdAt: -1 });
      return res.json({ success: true, data: { ...contact.toObject(), notes } });
    }
    await init();
    const contact = store.contacts.find((c) => String(c._id) === String(req.params.id));
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    const notes = (store.notes || []).filter((n) => String(n.contactId || n.contact) === String(req.params.id));
    res.json({ success: true, data: { ...contact, notes } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createContact = async (req, res) => {
  try {
    const payload = { ...req.body, createdBy: req.user?._id };
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
    if (isMongoConnected()) {
      const contact = await Contact.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
      return res.json({ success: true, data: contact, message: 'Contact updated' });
    }
    await init();
    const contact = store.contacts.find((c) => String(c._id) === String(req.params.id));
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    Object.assign(contact, req.body, { updatedAt: new Date().toISOString() });
    res.json({ success: true, data: contact, message: 'Contact updated' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.bulkCreateContacts = async (req, res) => {
  try {
    const { contacts } = req.body;
    if (!Array.isArray(contacts) || contacts.length === 0) return res.status(400).json({ success: false, message: 'Contacts array required' });
    const docs = contacts.map((c) => ({ ...c, createdBy: req.user?._id }));
    if (isMongoConnected()) {
      const result = await Contact.insertMany(docs, { ordered: false });
      return res.status(201).json({ success: true, count: result.length, data: result });
    }
    await init();
    const created = docs.map((c, i) => ({ _id: `ct${Date.now()}${i}`, createdAt: new Date().toISOString(), ...c }));
    store.contacts.push(...created);
    res.status(201).json({ success: true, count: created.length, data: created });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Excel import + one-day-before reminders.
// Accepted Excel columns include Name, Phone, Architect Name, Firm Name, Area,
// Address, Location, Date/Meeting Call Date and Remark(s).
// exports.importExcel = async (req, res) => {
//   try {
//     if (!req.file) return res.status(400).json({ success: false, message: 'Excel file is required (field: file)' });

//     const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
//     const sheet = workbook.Sheets[workbook.SheetNames[0]];
//     if (!sheet) return res.status(400).json({ success: false, message: 'Excel sheet not found' });

//     const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
//     const contacts = rows.map(normaliseContactRow).filter((c) => c.phone);
//     if (!contacts.length) return res.status(400).json({ success: false, message: 'No valid rows with phone number found' });

//     let created = [], remindersCreated = 0;
//     if (isMongoConnected()) {
//       for (const payload of contacts) {
//         payload.createdBy = req.user?._id;
//         const contact = await Contact.findOneAndUpdate(
//           { phone: payload.phone },
//           { $set: payload, $setOnInsert: { createdBy: req.user?._id } },
//           { new: true, upsert: true, setDefaultsOnInsert: true }
//         );
//         created.push(contact);
//         if (payload.reminderAt) {
//           await Note.create({
//             contact: contact._id,
//             contactId: String(contact._id),
//             title: `Follow-up reminder: ${contact.name || contact.phone}`,
//             content: payload.remark || `Follow-up for ${contact.date ? new Date(contact.date).toLocaleString('en-IN') : 'scheduled date'}`,
//             type: 'reminder',
//             date: payload.reminderAt,
//             createdBy: req.user?._id,
//           });
//           remindersCreated++;
//         }
//       }
//     } else {
//       await init();
//       for (const payload of contacts) {
//         let contact = store.contacts.find((c) => c.phone === payload.phone);
//         if (!contact) {
//           contact = { _id: `ct${Date.now()}${Math.random()}`, createdAt: new Date().toISOString() };
//           store.contacts.push(contact);
//         }
//         Object.assign(contact, payload, { createdBy: req.user?._id, updatedAt: new Date().toISOString() });
//         created.push(contact);
//         if (payload.reminderAt) {
//           store.notes = store.notes || [];
//           store.notes.unshift({
//             _id: `n${Date.now()}${Math.random()}`,
//             contactId: String(contact._id),
//             title: `Follow-up reminder: ${contact.name || contact.phone}`,
//             content: payload.remark || 'Imported Excel reminder',
//             type: 'reminder',
//             date: payload.reminderAt,
//             completed: false,
//             createdAt: new Date().toISOString(),
//           });
//           remindersCreated++;
//         }
//       }
//     }

//     res.status(201).json({
//       success: true,
//       count: created.length,
//       remindersCreated,
//       reminderRule: 'Reminder is created exactly 1 day before Date/Meeting Call Date. A date found in Remark is also accepted.',
//       data: created,
//     });
//   } catch (error) {
//     res.status(400).json({ success: false, message: `Excel import failed: ${error.message}` });
//   }
// };

// ============================================================
// FLEXIBLE COLUMN MATCHER
// Handles case differences, extra spaces, "/" spacing variations
// ============================================================

function findColumn(row, aliases) {
  const keys = Object.keys(row || {});
  const normalize = (s) =>
    String(s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/');

  const found = keys.find((k) => aliases.includes(normalize(k)));
  return found ? row[found] : undefined;
}

exports.importExcel = async (req, res) => {
  try {
    // ============================================================
    // 1. CHECK FILE
    // ============================================================
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Excel file is required (field: file)',
      });
    }

    // ============================================================
    // 2. READ EXCEL
    // ============================================================
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

    // ============================================================
    // 3. HELPERS
    // ============================================================
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
    const createdBy = req.user?._id || null;
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
          { phone: payload.phone },
          update,
          { new: true, upsert: true, setDefaultsOnInsert: true }
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
        let contact = store.contacts.find((c) => c.phone === payload.phone);

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




// exports.importExcel = async (req, res) => {
//   try {
//     // ============================================================
//     // 1. CHECK FILE
//     // ============================================================

//     if (!req.file) {
//       return res.status(400).json({
//         success: false,
//         message: 'Excel file is required (field: file)',
//       });
//     }

//     // ============================================================
//     // 2. READ EXCEL
//     // ============================================================

//     const workbook = XLSX.read(req.file.buffer, {
//       type: 'buffer',
//       cellDates: true,
//     });

//     const sheetName = workbook.SheetNames[0];

//     if (!sheetName) {
//       return res.status(400).json({
//         success: false,
//         message: 'Excel sheet not found',
//       });
//     }

//     const sheet = workbook.Sheets[sheetName];

//     const rows = XLSX.utils.sheet_to_json(sheet, {
//       defval: '',
//       raw: true,
//     });

//     if (!rows.length) {
//       return res.status(400).json({
//         success: false,
//         message: 'Excel file contains no data rows',
//       });
//     }

//     console.log('========================================');
//     console.log('[Excel] Headers:', Object.keys(rows[0]));
//     console.log('[Excel] First row:', rows[0]);
//     console.log('========================================');

//     // ============================================================
//     // 3. HELPERS
//     // ============================================================

//     const clean = (value) => {
//       if (
//         value === undefined ||
//         value === null
//       ) {
//         return '';
//       }

//       return String(value).trim();
//     };

//     // ------------------------------------------------------------
//     // DATE PARSER
//     // ------------------------------------------------------------

//     const parseDate = (value) => {
//       if (
//         value === undefined ||
//         value === null ||
//         value === ''
//       ) {
//         return null;
//       }

//       // Already a Date
//       if (value instanceof Date) {
//         return isNaN(value.getTime())
//           ? null
//           : value;
//       }

//       // Excel serial number
//       if (typeof value === 'number') {
//         const parsed =
//           XLSX.SSF.parse_date_code(value);

//         if (!parsed) {
//           return null;
//         }

//         return new Date(
//           parsed.y,
//           parsed.m - 1,
//           parsed.d,
//           parsed.H || 0,
//           parsed.M || 0,
//           parsed.S || 0
//         );
//       }

//       const text = String(value).trim();

//       // ----------------------------------------------------------
//       // DD/MM/YYYY
//       // ----------------------------------------------------------

//       const ddmmyyyy = text.match(
//         /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
//       );

//       if (ddmmyyyy) {
//         const day = Number(ddmmyyyy[1]);
//         const month = Number(ddmmyyyy[2]);
//         const year = Number(ddmmyyyy[3]);

//         const date = new Date(
//           year,
//           month - 1,
//           day
//         );

//         if (
//           date.getFullYear() === year &&
//           date.getMonth() === month - 1 &&
//           date.getDate() === day
//         ) {
//           return date;
//         }
//       }

//       // ----------------------------------------------------------
//       // DD-MM-YYYY
//       // ----------------------------------------------------------

//       const ddmmyyyyDash = text.match(
//         /^(\d{1,2})-(\d{1,2})-(\d{4})$/
//       );

//       if (ddmmyyyyDash) {
//         const day = Number(ddmmyyyyDash[1]);
//         const month = Number(ddmmyyyyDash[2]);
//         const year = Number(ddmmyyyyDash[3]);

//         const date = new Date(
//           year,
//           month - 1,
//           day
//         );

//         if (
//           date.getFullYear() === year &&
//           date.getMonth() === month - 1 &&
//           date.getDate() === day
//         ) {
//           return date;
//         }
//       }

//       // ----------------------------------------------------------
//       // YYYY-MM-DD
//       // ----------------------------------------------------------

//       const yyyymmdd = text.match(
//         /^(\d{4})-(\d{1,2})-(\d{1,2})$/
//       );

//       if (yyyymmdd) {
//         const year = Number(yyyymmdd[1]);
//         const month = Number(yyyymmdd[2]);
//         const day = Number(yyyymmdd[3]);

//         const date = new Date(
//           year,
//           month - 1,
//           day
//         );

//         if (!isNaN(date.getTime())) {
//           return date;
//         }
//       }

//       // ----------------------------------------------------------
//       // Last attempt
//       // ----------------------------------------------------------

//       const parsed = new Date(text);

//       if (!isNaN(parsed.getTime())) {
//         return parsed;
//       }

//       return null;
//     };

//     // ------------------------------------------------------------
//     // EXTRACT DATE FROM REMARK
//     // ------------------------------------------------------------

//     const extractDateFromRemark = (remark) => {
//       if (!remark) {
//         return null;
//       }

//       const text = String(remark);

//       const match = text.match(
//         /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/
//       );

//       if (match) {
//         return parseDate(
//           `${match[1]}/${match[2]}/${match[3]}`
//         );
//       }

//       return null;
//     };

//     // ------------------------------------------------------------
//     // REMINDER DATE
//     // ------------------------------------------------------------

//     const getReminderDate = (
//       date,
//       meetingCallDate,
//       remark
//     ) => {
//       let sourceDate = null;

//       // Priority:
//       // Date
//       // Meeting/Call Date
//       // Date inside Remark

//       if (date) {
//         sourceDate = date;
//       } else if (meetingCallDate) {
//         sourceDate = meetingCallDate;
//       } else {
//         sourceDate =
//           extractDateFromRemark(remark);
//       }

//       if (!sourceDate) {
//         return null;
//       }

//       const reminderDate =
//         new Date(sourceDate);

//       reminderDate.setDate(
//         reminderDate.getDate() - 1
//       );

//       return reminderDate;
//     };

//     // ============================================================
//     // 4. NORMALISE EXCEL ROWS
//     // ============================================================

//     const contacts = [];

//     rows.forEach((row, index) => {
//       try {
//         // ========================================================
//         // EXACT EXCEL COLUMNS
//         // ========================================================

//         const name = clean(
//           row['Name']
//         );

//         const phone = clean(
//           row['Phone']
//         ).replace(/\D/g, '');

//         const architectName = clean(
//           row['Architect Name']
//         );

//         const firmName = clean(
//           row['Firm Name']
//         );

//         const area = clean(
//           row['Area']
//         );

//         const address = clean(
//           row['Address']
//         );

//         const location = clean(
//           row['Location']
//         );

//         // IMPORTANT:
//         // Exact Excel column = Date
//         const dateValue =
//           row['Date'];

//         // IMPORTANT:
//         // Exact Excel column = Meeting/Call Date
//         const meetingCallDateValue =
//           row['Meeting/Call Date'];

//         const req = clean(
//           row['REQ']
//         );

//         const requirement = clean(
//           row['Requirement']
//         );

//         const email = clean(
//           row['Email']
//         );

//         const remark = clean(
//           row['Remark']
//         );

//         // ========================================================
//         // PARSE DATES
//         // ========================================================

//         const date =
//           parseDate(dateValue);

//         const meetingCallDate =
//           parseDate(
//             meetingCallDateValue
//           );

//         // ========================================================
//         // REMINDER
//         // ========================================================

//         const reminderAt =
//           getReminderDate(
//             date,
//             meetingCallDate,
//             remark
//           );

//         console.log(
//           `[Excel] Row ${index + 2}`,
//           {
//             name,
//             phone,

//             // Original Excel values
//             excelDate: dateValue,
//             excelMeetingCallDate:
//               meetingCallDateValue,

//             // Parsed values
//             date,
//             meetingCallDate,
//             reminderAt,
//           }
//         );

//         // ========================================================
//         // PHONE REQUIRED
//         // ========================================================

//         if (!phone) {
//           console.warn(
//             `[Excel] Row ${index + 2}: phone missing`
//           );

//           return;
//         }

//         // ========================================================
//         // CONTACT OBJECT
//         // ========================================================

//         contacts.push({
//           name,

//           phone,

//           architectName,

//           firmName,

//           area,

//           address,

//           location,

//           date,

//           meetingCallDate,

//           req,

//           requirement,

//           email,

//           remark,

//           reminderAt,

//           status: 'Active',

//           lists: [],

//           tags: [],
//         });

//       } catch (error) {
//         console.warn(
//           `[Excel] Row ${index + 2} skipped:`,
//           error.message
//         );
//       }
//     });

//     // ============================================================
//     // 5. VALIDATION
//     // ============================================================

//     if (!contacts.length) {
//       return res.status(400).json({
//         success: false,
//         message:
//           'No valid rows with phone number found.',
//       });
//     }

//     // ============================================================
//     // 6. CREATED BY
//     // ============================================================

//     const createdBy =
//       req.user?._id || null;

//     const created = [];

//     let remindersCreated = 0;

//     // ============================================================
//     // 7. MONGODB
//     // ============================================================

//     if (isMongoConnected()) {
//       for (const payload of contacts) {
//         const updateData = {
//           name: payload.name,
//           phone: payload.phone,

//           architectName:
//             payload.architectName,

//           firmName:
//             payload.firmName,

//           area:
//             payload.area,

//           address:
//             payload.address,

//           location:
//             payload.location,

//           date:
//             payload.date,

//           meetingCallDate:
//             payload.meetingCallDate,

//           req:
//             payload.req,

//           requirement:
//             payload.requirement,

//           email:
//             payload.email,

//           remark:
//             payload.remark,

//           reminderAt:
//             payload.reminderAt,

//           status:
//             payload.status,

//           lists:
//             payload.lists,

//           tags:
//             payload.tags,

//           updatedAt:
//             new Date(),
//         };

//         const update = {
//           $set: updateData,
//         };

//         if (createdBy) {
//           update.$setOnInsert = {
//             createdBy,
//             createdAt: new Date(),
//           };
//         }

//         const contact =
//           await Contact.findOneAndUpdate(
//             {
//               phone: payload.phone,
//             },
//             update,
//             {
//               new: true,
//               upsert: true,
//               setDefaultsOnInsert: true,
//             }
//           );

//         created.push(contact);

//         // ========================================================
//         // CREATE REMINDER
//         // ========================================================

//         if (payload.reminderAt) {
//           await Note.create({
//             contact:
//               contact._id,

//             contactId:
//               String(contact._id),

//             title:
//               `Follow-up reminder: ${
//                 contact.name ||
//                 contact.phone
//               }`,

//             content:
//               payload.remark ||
//               'Imported Excel reminder',

//             type:
//               'reminder',

//             date:
//               payload.reminderAt,

//             completed:
//               false,

//             createdBy,
//           });

//           remindersCreated++;
//         }
//       }
//     }

//     // ============================================================
//     // 8. MEMORY STORE
//     // ============================================================

//     else {
//       await init();

//       for (const payload of contacts) {
//         let contact =
//           store.contacts.find(
//             (c) =>
//               c.phone ===
//               payload.phone
//           );

//         // --------------------------------------------------------
//         // CREATE
//         // --------------------------------------------------------

//         if (!contact) {
//           contact = {
//             _id:
//               `ct${Date.now()}${Math.random()}`,

//             createdAt:
//               new Date().toISOString(),

//             ...(createdBy
//               ? { createdBy }
//               : {}),
//           };

//           store.contacts.push(
//             contact
//           );
//         }

//         // --------------------------------------------------------
//         // UPDATE
//         // --------------------------------------------------------

//         Object.assign(
//           contact,
//           payload,
//           {
//             updatedAt:
//               new Date().toISOString(),
//           }
//         );

//         created.push(contact);

//         // --------------------------------------------------------
//         // REMINDER
//         // --------------------------------------------------------

//         if (payload.reminderAt) {
//           store.notes =
//             store.notes || [];

//           store.notes.unshift({
//             _id:
//               `n${Date.now()}${Math.random()}`,

//             contactId:
//               String(contact._id),

//             title:
//               `Follow-up reminder: ${
//                 contact.name ||
//                 contact.phone
//               }`,

//             content:
//               payload.remark ||
//               'Imported Excel reminder',

//             type:
//               'reminder',

//             date:
//               payload.reminderAt,

//             completed:
//               false,

//             createdAt:
//               new Date().toISOString(),

//             ...(createdBy
//               ? { createdBy }
//               : {}),
//           });

//           remindersCreated++;
//         }
//       }
//     }

//     // ============================================================
//     // 9. RESPONSE
//     // ============================================================

//     return res.status(201).json({
//       success: true,

//       count:
//         created.length,

//       remindersCreated,

//       reminderRule:
//         'Reminder is created exactly 1 day before Date/Meeting Call Date. A date found in Remark is also accepted.',

//       data:
//         created,
//     });

//   } catch (error) {
//     console.error(
//       '[Excel Import Error]',
//       error
//     );

//     return res.status(400).json({
//       success: false,

//       message:
//         `Excel import failed: ${error.message}`,
//     });
//   }
// };

exports.searchContacts = async (req, res) => {
  req.query.search = req.query.q || req.query.search || '';
  return exports.getContacts(req, res);
};

exports.deleteContact = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const deleted = await Contact.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ success: false, message: 'Contact not found' });
      return res.json({ success: true, message: 'Contact deleted' });
    }
    await init();
    const idx = store.contacts.findIndex((c) => String(c._id) === String(req.params.id));
    if (idx < 0) return res.status(404).json({ success: false, message: 'Contact not found' });
    store.contacts.splice(idx, 1);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 001 code delete 
exports.deleteAllContacts = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const result = await Contact.deleteMany({});

      return res.status(200).json({
        success: true,
        message: 'All contacts deleted successfully',
        deletedCount: result.deletedCount,
      });
    }

    // MEMORY MODE
    await init();

    const deletedCount = store.contacts.length;

    store.contacts.length = 0;

    return res.status(200).json({
      success: true,
      message: 'All contacts deleted successfully',
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
    if (isMongoConnected()) return res.json({ success: true, data: await ContactList.find().sort({ createdAt: -1 }) });
    await init();
    res.json({ success: true, data: store.contactLists || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createList = async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ success: false, message: 'name required' });
    if (isMongoConnected()) return res.status(201).json({ success: true, data: await ContactList.create({ ...req.body, createdBy: req.user?._id }) });
    await init();
    store.contactLists = store.contactLists || [];
    const list = { _id: `l${Date.now()}`, ...req.body, createdAt: new Date().toISOString() };
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
      const contact = await Contact.findById(req.params.id);

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
      (c) => String(c._id) === String(req.params.id)
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

exports.getContactTags = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const tags = await Contact.aggregate([
        {
          $unwind: '$tags'
        },
        {
          $group: {
            _id: '$tags'
          }
        },
        {
          $sort: {
            _id: 1
          }
        }
      ]);

      return res.status(200).json({
        success: true,
        data: tags.map((item) => item._id)
      });
    }

    // MEMORY MODE
    await init();

    const tags = [
      ...new Set(
        store.contacts.flatMap((contact) =>
          Array.isArray(contact.tags)
            ? contact.tags
            : []
        )
      )
    ].sort();

    return res.status(200).json({
      success: true,
      data: tags
    });

  } catch (error) {
    console.error('[GET CONTACT TAGS ERROR]', error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getContactStats = async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments();

    const withEmail = await Contact.countDocuments({
      email: { $exists: true, $ne: '' }
    });

    const withPhone = await Contact.countDocuments({
      phone: { $exists: true, $ne: '' }
    });

    const withTags = await Contact.countDocuments({
      tags: { $exists: true, $ne: [] }
    });

    return res.status(200).json({
      success: true,
      data: {
        totalContacts,
        withEmail,
        withPhone,
        withTags
      }
    });
  } catch (error) {
    console.error('[GET CONTACT STATS ERROR]', error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};