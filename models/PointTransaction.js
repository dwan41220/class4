const mongoose = require('mongoose');

const pointTransactionSchema = new mongoose.Schema({
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['VIEW_REWARD', 'TRANSFER', 'FEE', 'ADMIN_ADJUST'], required: true },
    description: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('PointTransaction', pointTransactionSchema);
