const mongoose = require('mongoose');

exports.connectDB = async (url) => {
  try {
    await mongoose.connect(url, {
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      bufferTimeoutMS: 30000
    });

    console.log('MongoDB Connected');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};
