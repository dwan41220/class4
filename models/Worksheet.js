const mongoose = require('mongoose');

const worksheetSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    fileUrl: { type: String, required: true },
    filePublicId: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    thumbnailPublicId: { type: String, default: null },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    views: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Worksheet', worksheetSchema);
