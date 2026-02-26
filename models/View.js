const mongoose = require('mongoose');

const viewSchema = new mongoose.Schema({
    worksheet: { type: mongoose.Schema.Types.ObjectId, ref: 'Worksheet', required: true },
    viewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

viewSchema.index({ worksheet: 1, viewer: 1 }, { unique: true });

module.exports = mongoose.model('View', viewSchema);
