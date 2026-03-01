const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, default: null },
  isActivated: { type: Boolean, default: false },
  points: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  learningTime: { type: Number, default: 0 }, // Total learning time in seconds
  highestStudyTime: { type: Number, default: 0 }, // Highest daily cumulative study time in seconds
  totalDownloads: { type: Number, default: 0 }, // Total unique worksheet downloads
  memo: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
