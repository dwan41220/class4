const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const { authMiddleware } = require('../middleware/auth');
const { uploadImage } = require('../config/cloudinary');

// GET /api/subjects — 과목 목록
router.get('/', async (req, res) => {
    try {
        const subjects = await Subject.find().populate('createdBy', 'username').sort({ name: 1 });
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/subjects — 새 과목 추가
router.post('/', authMiddleware, uploadImage.single('thumbnail'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: '과목 이름을 입력하세요.' });

        const exists = await Subject.findOne({ name });
        if (exists) return res.status(400).json({ error: '이미 존재하는 과목입니다.' });

        const subject = await Subject.create({
            name,
            createdBy: req.user.userId,
            thumbnailUrl: req.file ? req.file.path : null,
        });

        res.json({ message: `과목 "${name}" 추가 완료!`, subject });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// PATCH /api/subjects/:id/thumbnail — 과목 표지 변경
router.patch('/:id/thumbnail', authMiddleware, uploadImage.single('thumbnail'), async (req, res) => {
    try {
        const subject = await Subject.findById(req.params.id);
        if (!subject) return res.status(404).json({ error: '과목을 찾을 수 없습니다.' });
        if (subject.createdBy.toString() !== req.user.userId) return res.status(403).json({ error: '과목 생성자만 표지를 변경할 수 있습니다.' });

        subject.thumbnailUrl = req.file ? req.file.path : subject.thumbnailUrl;
        await subject.save();
        res.json({ message: '표지 변경 완료!', subject });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
