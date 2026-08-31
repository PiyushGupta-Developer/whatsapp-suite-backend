const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/whatsapp_bulk',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 3000,
      }
    );
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error) {
    console.error(`❌ MongoDB Error: ${error.message}`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1); // Hard fail in production
    } else {
      console.warn('⚠️ Running in MEMORY mode (no MongoDB) — demo data will be used');
      return false;
    }
  }
};

module.exports = connectDB;
