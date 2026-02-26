const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

// POST /api/follows/:userId — 팔로우
router.post('/:userId', authMiddleware, async (req, res) => {
    try {
        if (req.user.userId === req.params.userId) return res.status(400).json({ error: '자기 자신을 팔로우할 수 없습니다.' });

        const targetUser = await User.findById(req.params.userId);
        if (!targetUser) return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });

        const existing = await Follow.findOne({ follower: req.user.userId, following: req.params.userId });
        if (existing) return res.status(400).json({ error: '이미 팔로우한 유저입니다.' });

        await Follow.create({ follower: req.user.userId, following: req.params.userId });
        res.json({ message: `${targetUser.username}님을 팔로우했습니다!` });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/follows/:userId — 언팔로우
router.delete('/:userId', authMiddleware, async (req, res) => {
    try {
        const result = await Follow.findOneAndDelete({ follower: req.user.userId, following: req.params.userId });
        if (!result) return res.status(404).json({ error: '팔로우 관계가 없습니다.' });
        res.json({ message: '언팔로우 완료!' });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/follows/followers — 팔로워 목록
router.get('/followers', authMiddleware, async (req, res) => {
    try {
        const follows = await Follow.find({ following: req.user.userId }).populate('follower', 'username points');
        res.json(follows.map(f => f.follower));
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/follows/following — 팔로잉 목록
router.get('/following', authMiddleware, async (req, res) => {
    try {
        const follows = await Follow.find({ follower: req.user.userId }).populate('following', 'username points');
        res.json(follows.map(f => f.following));
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
