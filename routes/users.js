const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Worksheet = require('../models/Worksheet');
const Follow = require('../models/Follow');
const AdminConfig = require('../models/AdminConfig');
const { authMiddleware } = require('../middleware/auth');

// GET /api/users/me — 내 프로필 (반드시 /:id 보다 먼저 선언)
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-passwordHash');
        if (!user) return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });

        const followerCount = await Follow.countDocuments({ following: user._id });
        const followingCount = await Follow.countDocuments({ follower: user._id });
        const topWorksheets = await Worksheet.find({ uploader: user._id })
            .sort({ views: -1 })
            .limit(3)
            .populate('subject', 'name');

        res.json({ user, followerCount, followingCount, topWorksheets });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/users/classmates — 학우 목록 (관리자 계정명 제외, 본인 제외, 팔로우 상태 포함)
router.get('/classmates', authMiddleware, async (req, res) => {
    try {
        let myId;
        try {
            myId = new mongoose.Types.ObjectId(req.user.userId);
        } catch (e) {
            return res.status(400).json({ error: '유효하지 않은 유저 ID' });
        }

        // 관리자 계정 이름 목록 조회
        const adminConfigs = await AdminConfig.find().select('username').lean();
        const adminUsernames = adminConfigs.map(a => a.username);

        // 본인 제외 + 관리자 계정명 제외
        const filter = { _id: { $ne: myId } };
        if (adminUsernames.length > 0) {
            filter.username = { $nin: adminUsernames };
        }

        const users = await User.find(filter).select('-passwordHash').sort({ username: 1 }).lean();

        const myFollowing = await Follow.find({ follower: myId }).select('following').lean();
        const followingIds = new Set(myFollowing.map(f => f.following?.toString()).filter(Boolean));

        const myFollowers = await Follow.find({ following: myId }).select('follower').lean();
        const followerIds = new Set(myFollowers.map(f => f.follower?.toString()).filter(Boolean));

        const result = users.map(u => ({
            _id: u._id,
            username: u.username,
            points: u.points,
            isFollowing: followingIds.has(u._id.toString()),
            isFollower: followerIds.has(u._id.toString()),
        }));

        res.json(result);
    } catch (err) {
        console.error('GET /api/users/classmates error:', err.stack || err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/users — 전체 유저 목록
router.get('/', authMiddleware, async (req, res) => {
    try {
        let myId;
        try {
            myId = new mongoose.Types.ObjectId(req.user.userId);
        } catch (e) {
            return res.status(400).json({ error: '유효하지 않은 유저 ID' });
        }
        const users = await User.find({ _id: { $ne: myId } }).select('-passwordHash').sort({ username: 1 });
        const myFollowing = await Follow.find({ follower: myId }).select('following');
        const followingIds = new Set(myFollowing.map(f => f.following?.toString()).filter(Boolean));

        const myFollowers = await Follow.find({ following: myId }).select('follower');
        const followerIds = new Set(myFollowers.map(f => f.follower?.toString()).filter(Boolean));

        const result = users.map(u => ({
            _id: u._id,
            username: u.username,
            points: u.points,
            isFollowing: followingIds.has(u._id.toString()),
            isFollower: followerIds.has(u._id.toString()),
        }));

        res.json(result);
    } catch (err) {
        console.error('GET /api/users error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/users/:id — 타인 프로필
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-passwordHash');
        if (!user) return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });

        const followerCount = await Follow.countDocuments({ following: user._id });
        const followingCount = await Follow.countDocuments({ follower: user._id });
        const isFollowing = await Follow.findOne({ follower: req.user.userId, following: user._id });
        const topWorksheets = await Worksheet.find({ uploader: user._id })
            .sort({ views: -1 })
            .limit(3)
            .populate('subject', 'name');

        res.json({ user, followerCount, followingCount, isFollowing: !!isFollowing, topWorksheets });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
