const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Worksheet = require('../models/Worksheet');
const Subject = require('../models/Subject');
const View = require('../models/View');
const PointTransaction = require('../models/PointTransaction');
const { adminMiddleware } = require('../middleware/auth');
const { cloudinary } = require('../config/cloudinary');

// POST /api/admin/users — 새 계정 생성 (이름만)
router.post('/users', adminMiddleware, async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: '계정 이름을 입력하세요.' });

        const exists = await User.findOne({ username });
        if (exists) return res.status(400).json({ error: '이미 존재하는 계정 이름입니다.' });

        const user = await User.create({ username });
        res.json({ message: `계정 "${username}" 생성 완료!`, user });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/admin/users/:id — 계정 삭제
router.delete('/users/:id', adminMiddleware, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });
        res.json({ message: `계정 "${user.username}" 삭제 완료!` });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/admin/users — 전체 유저 목록
router.get('/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// PATCH /api/admin/users/:id/points — 포인트 더하기/빼기
router.patch('/users/:id/points', adminMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        if (amount === undefined || amount === 0) return res.status(400).json({ error: '포인트 양을 입력하세요.' });

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: '계정을 찾을 수 없습니다.' });

        user.points += amount;
        if (amount > 0) user.totalEarned += amount;
        await user.save();

        await PointTransaction.create({
            toUser: user._id,
            amount,
            type: 'ADMIN_ADJUST',
            description: `관리자 조정: ${amount > 0 ? '+' : ''}${amount}pt`,
        });

        res.json({ message: `${user.username}에게 ${amount}pt 조정 완료!`, points: user.points });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// PATCH /api/admin/worksheets/:id/views — 조회수 수정
router.patch('/worksheets/:id/views', adminMiddleware, async (req, res) => {
    try {
        const { views } = req.body;
        if (views === undefined) return res.status(400).json({ error: '조회수를 입력하세요.' });

        const worksheet = await Worksheet.findById(req.params.id);
        if (!worksheet) return res.status(404).json({ error: '학습지를 찾을 수 없습니다.' });

        worksheet.views = views;
        await worksheet.save();

        res.json({ message: '조회수 수정 완료!', views: worksheet.views });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/admin/worksheets/:id — 학습지 삭제 (파일+썸네일+조회수 포함)
router.delete('/worksheets/:id', adminMiddleware, async (req, res) => {
    try {
        const worksheet = await Worksheet.findById(req.params.id);
        if (!worksheet) return res.status(404).json({ error: '학습지를 찾을 수 없습니다.' });

        if (worksheet.filePublicId) await cloudinary.uploader.destroy(worksheet.filePublicId);
        if (worksheet.thumbnailPublicId) await cloudinary.uploader.destroy(worksheet.thumbnailPublicId);

        await View.deleteMany({ worksheet: worksheet._id });
        await Worksheet.findByIdAndDelete(req.params.id);

        res.json({ message: `학습지 "${worksheet.title}" 삭제 완료!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/admin/subjects/:id — 과목 삭제 (연쇄 삭제: 과목썸네일 + 하위학습지 + 파일조회수)
router.delete('/subjects/:id', adminMiddleware, async (req, res) => {
    try {
        const subject = await Subject.findById(req.params.id);
        if (!subject) return res.status(404).json({ error: '과목을 찾을 수 없습니다.' });

        if (subject.thumbnailPublicId) await cloudinary.uploader.destroy(subject.thumbnailPublicId);

        const worksheets = await Worksheet.find({ subject: subject._id });
        for (const w of worksheets) {
            if (w.filePublicId) await cloudinary.uploader.destroy(w.filePublicId);
            if (w.thumbnailPublicId) await cloudinary.uploader.destroy(w.thumbnailPublicId);
            await View.deleteMany({ worksheet: w._id });
            await Worksheet.findByIdAndDelete(w._id);
        }

        await Subject.findByIdAndDelete(req.params.id);

        res.json({ message: `과목 "${subject.name}" 및 포함된 학습지 모두 삭제 완료!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
