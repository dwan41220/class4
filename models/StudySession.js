const mongoose = require('mongoose');

const studySessionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: 0 }, // seconds
}, { timestamps: true });

// Index for fast lookups
studySessionSchema.index({ user: 1, endedAt: 1 });
studySessionSchema.index({ startedAt: -1 });

module.exports = mongoose.model('StudySession', studySessionSchema);
