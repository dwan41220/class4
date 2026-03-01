const express = require('express');
const router = express.Router();
const StudySession = require('../models/StudySession');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// POST /api/timer/start — Start studying
router.post('/start', authMiddleware, async (req, res) => {
    try {
        // Check for existing open session
        const existing = await StudySession.findOne({ user: req.user.userId, endedAt: null });
        if (existing) {
            return res.status(400).json({ error: '이미 공부 중입니다.', session: existing });
        }

        const session = await StudySession.create({ user: req.user.userId, startedAt: new Date() });
        res.json(session);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/timer/stop — Stop studying
router.post('/stop', authMiddleware, async (req, res) => {
    try {
        const session = await StudySession.findOne({ user: req.user.userId, endedAt: null });
        if (!session) {
            return res.status(400).json({ error: '진행 중인 공부 세션이 없습니다.' });
        }

        session.endedAt = new Date();
        session.duration = Math.floor((session.endedAt - session.startedAt) / 1000);
        await session.save();

        res.json(session);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/timer/status — My current session status + todaySeconds
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const session = await StudySession.findOne({ user: req.user.userId, endedAt: null });

        // Calculate today's total seconds
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);
        const todayStart = new Date(kstNow);
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayStart.getTime() - kstOffset);

        const todaySessions = await StudySession.find({
            user: req.user.userId,
            startedAt: { $gte: todayStartUTC },
            endedAt: { $ne: null }
        });
        let todaySeconds = todaySessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        if (session) {
            todaySeconds += Math.floor((now - session.startedAt) / 1000);
        }

        res.json({ studying: !!session, session, todaySeconds });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/timer/room — All users' study status (for desk view)
router.get('/room', authMiddleware, async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'admin' } }).select('username');

        // Get today's start (KST)
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);
        const todayStart = new Date(kstNow);
        todayStart.setUTCHours(0, 0, 0, 0);
        const todayStartUTC = new Date(todayStart.getTime() - kstOffset);

        // Get all active sessions (endedAt: null)
        const activeSessions = await StudySession.find({ endedAt: null }).populate('user', 'username');

        // Get today's completed sessions for each user (for fire level calc)
        const todaySessions = await StudySession.aggregate([
            { $match: { startedAt: { $gte: todayStartUTC }, endedAt: { $ne: null } } },
            { $group: { _id: '$user', totalDuration: { $sum: '$duration' } } }
        ]);
        const todayMap = {};
        todaySessions.forEach(s => { todayMap[s._id.toString()] = s.totalDuration; });

        const result = users.map(u => {
            const activeSession = activeSessions.find(s => s.user._id.toString() === u._id.toString());
            let todaySeconds = todayMap[u._id.toString()] || 0;

            // If currently studying, add elapsed time
            if (activeSession) {
                todaySeconds += Math.floor((now - activeSession.startedAt) / 1000);
            }

            const todayHours = todaySeconds / 3600;
            let fireLevel = 0;
            if (todayHours >= 5) fireLevel = 4;
            else if (todayHours >= 3) fireLevel = 3;
            else if (todayHours >= 1) fireLevel = 2;
            else if (todaySeconds > 0) fireLevel = 1;

            return {
                _id: u._id,
                username: u.username,
                studying: !!activeSession,
                startedAt: activeSession?.startedAt || null,
                todaySeconds,
                fireLevel,
            };
        });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/timer/ranking — Weekly ranking
router.get('/ranking', authMiddleware, async (req, res) => {
    try {
        // This week: Monday 00:00 KST to now
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstNow = new Date(now.getTime() + kstOffset);
        const dayOfWeek = kstNow.getUTCDay(); // 0=Sun
        const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days since Monday
        const monday = new Date(kstNow);
        monday.setUTCDate(kstNow.getUTCDate() - diff);
        monday.setUTCHours(0, 0, 0, 0);
        const mondayUTC = new Date(monday.getTime() - kstOffset);

        const ranking = await StudySession.aggregate([
            { $match: { startedAt: { $gte: mondayUTC }, endedAt: { $ne: null } } },
            { $group: { _id: '$user', totalDuration: { $sum: '$duration' } } },
            { $sort: { totalDuration: -1 } },
            { $limit: 10 },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userInfo' } },
            { $unwind: '$userInfo' },
            { $project: { username: '$userInfo.username', totalDuration: 1 } }
        ]);

        res.json(ranking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
