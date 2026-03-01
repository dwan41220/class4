const mongoose = require('mongoose');

const downloadSchema = new mongoose.Schema({
    worksheet: { type: mongoose.Schema.Types.ObjectId, ref: 'Worksheet', required: true },
    downloader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

downloadSchema.index({ worksheet: 1, downloader: 1 }, { unique: true });

module.exports = mongoose.model('Download', downloadSchema);
