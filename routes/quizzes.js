const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const QuizScore = require('../models/QuizScore');
const User = require('../models/User');
const PointTransaction = require('../models/PointTransaction');
const { authMiddleware } = require('../middleware/auth');

// POST /api/quizzes — 퀴즈 업로드
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { title, subject, questions } = req.body;
        if (!title || !questions || questions.length < 2) {
            return res.status(400).json({ error: '제목과 최소 2개 이상의 문제가 필요합니다.' });
        }

        for (const q of questions) {
            if (!q.question || !q.choices || q.choices.length < 2 || q.answerIndex === undefined) {
                return res.status(400).json({ error: '각 문제에는 질문, 2개 이상의 보기, 정답 번호가 필요합니다.' });
            }
        }

        const quiz = await Quiz.create({
            title,
            subject: subject || undefined,
            creator: req.user.userId,
            questions,
        });

        res.status(201).json(quiz);
    } catch (err) {
        console.error('Quiz create error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/quizzes — 퀴즈 목록
router.get('/', async (req, res) => {
    try {
        const { subject } = req.query;
        const filter = subject ? { subject } : {};
        const quizzes = await Quiz.find(filter)
            .populate('creator', 'username')
            .populate('subject', 'name')
            .sort({ createdAt: -1 });
        res.json(quizzes);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/quizzes/leaderboard/weekly — 주간 리더보드
router.get('/leaderboard/weekly', authMiddleware, async (req, res) => {
    try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const leaderboard = await QuizScore.aggregate([
            { $match: { playedAt: { $gte: oneWeekAgo } } },
            { $group: { _id: '$player', totalScore: { $sum: '$score' }, gamesPlayed: { $sum: 1 } } },
            { $sort: { totalScore: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    _id: 1,
                    totalScore: 1,
                    gamesPlayed: 1,
                    username: '$user.username',
                }
            }
        ]);

        res.json(leaderboard);
    } catch (err) {
        console.error('Leaderboard error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/quizzes/:id — 퀴즈 상세 (게임용)
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id)
            .populate('creator', 'username')
            .populate('subject', 'name');
        if (!quiz) return res.status(404).json({ error: '퀴즈를 찾을 수 없습니다.' });
        res.json(quiz);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/quizzes/:id/score — 점수 기록 + 업로더 100pt
router.post('/:id/score', authMiddleware, async (req, res) => {
    try {
        const { score, mode } = req.body;
        if (score === undefined || !mode) {
            return res.status(400).json({ error: '점수와 모드가 필요합니다.' });
        }

        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ error: '퀴즈를 찾을 수 없습니다.' });

        // 점수 기록
        await QuizScore.create({
            quiz: quiz._id,
            player: req.user.userId,
            score,
            mode,
        });

        // 플레이 카운트 증가
        quiz.playCount += 1;
        await quiz.save();

        // 업로더에게 100pt (본인 제외)
        if (quiz.creator.toString() !== req.user.userId) {
            const creator = await User.findById(quiz.creator);
            if (creator) {
                creator.points += 100;
                creator.totalEarned += 100;
                await creator.save();

                await PointTransaction.create({
                    toUser: creator._id,
                    fromUser: req.user.userId,
                    amount: 100,
                    type: 'QUIZ_PLAY_REWARD',
                    description: `"${quiz.title}" 퀴즈 플레이 보상`,
                });
            }
        }

        res.json({ message: '점수가 기록되었습니다!', score });
    } catch (err) {
        console.error('Score record error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// PUT /api/quizzes/:id — 퀴즈 수정
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { title, subject, questions } = req.body;
        if (!title || !questions || questions.length < 2) {
            return res.status(400).json({ error: '제목과 최소 2개 이상의 문제가 필요합니다.' });
        }

        for (const q of questions) {
            if (!q.question || !q.choices || q.choices.length < 2 || q.answerIndex === undefined) {
                return res.status(400).json({ error: '각 문제에는 질문, 2개 이상의 보기, 정답 번호가 필요합니다.' });
            }
        }

        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ error: '퀴즈를 찾을 수 없습니다.' });

        // 출제자 본인 확인
        if (quiz.creator.toString() !== req.user.userId) {
            return res.status(403).json({ error: '수정 권한이 없습니다.' });
        }

        quiz.title = title;
        quiz.subject = subject || undefined;
        quiz.questions = questions;
        await quiz.save();

        res.json({ message: '퀴즈가 수정되었습니다!', quiz });
    } catch (err) {
        console.error('Quiz update error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
