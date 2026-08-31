const path = require('path');
const fs = require('fs');
const Media = require('../models/Media');
const multer = require('multer');
const { store, init, isMongoConnected } = require('../utils/memoryStore');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|pdf|doc|docx|xls|xlsx|mp3|wav|ogg/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  if (ext) cb(null, true);
  else cb(new Error('File type not allowed'), false);
};

exports.upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter });

function getType(mime, name) {
  if (mime.startsWith('image/')) return 'Image';
  if (mime.startsWith('video/')) return 'Video';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (mime.startsWith('audio/')) return 'Audio';
  return 'Document';
}

exports.uploadMedia = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }
    if (isMongoConnected()) {
      const mediaItems = [];
      for (const file of req.files) {
        const item = await Media.create({
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          type: getType(file.mimetype, file.originalname),
          path: `/uploads/${file.filename}`,
          uploadedBy: req.user._id,
        });
        mediaItems.push(item);
      }
      return res.status(201).json({ success: true, data: mediaItems });
    }
    await init();
    const mediaItems = req.files.map((file) => {
      const item = {
        _id: `m${Date.now()}${Math.random()}`,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        type: getType(file.mimetype, file.originalname),
        path: `/uploads/${file.filename}`,
      };
      store.media.push(item);
      return item;
    });
    res.status(201).json({ success: true, data: mediaItems });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMedia = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const media = await Media.find().sort({ createdAt: -1 }).populate('uploadedBy', 'name');
      return res.json({ success: true, count: media.length, data: media });
    }
    await init();
    res.json({ success: true, count: store.media.length, data: store.media });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteMedia = async (req, res) => {
  try {
    if (isMongoConnected()) {
      const media = await Media.findById(req.params.id);
      if (!media) return res.status(404).json({ success: false, message: 'Media not found' });
      const filePath = path.join(__dirname, '../../uploads', media.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await media.deleteOne();
      return res.json({ success: true, message: 'Media deleted' });
    }
    await init();
    const idx = store.media.findIndex((m) => m._id === req.params.id);
    if (idx < 0) return res.status(404).json({ success: false, message: 'Media not found' });
    store.media.splice(idx, 1);
    res.json({ success: true, message: 'Media deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
