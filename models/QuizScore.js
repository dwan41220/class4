const mongoose = require('mongoose');

const quizScoreSchema = new mongoose.Schema({
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true },
    mode: { type: String, enum: ['quiz', 'match', 'speed'], required: true },
    playedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('QuizScore', quizScoreSchema);
