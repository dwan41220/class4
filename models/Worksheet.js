const mongoose = require('mongoose');

const worksheetSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    fileUrl: { type: String, default: null }, // Made optional to support external links
    filePublicId: { type: String, default: null },
    externalUrl: { type: String, default: null }, // For Google Drive or other external links
    thumbnailUrl: { type: String, default: null },
    thumbnailPublicId: { type: String, default: null },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    views: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Worksheet', worksheetSchema);
