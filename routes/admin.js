const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Worksheet = require('../models/Worksheet');
const Subject = require('../models/Subject');
const View = require('../models/View');
const PointTransaction = require('../models/PointTransaction');
const Config = require('../models/Config');
const { adminMiddleware } = require('../middleware/auth');
const { cloudinary } = require('../config/cloudinary');
const { deleteFromGoogleDrive, getAuthUrl, getOAuth2Client } = require('../config/gdrive');
const jwt = require('jsonwebtoken');

// ==========================================
// GOOGLE DRIVE OAUTH ROUTES
// (Must be at the top to avoid /:id route collisions)
// ==========================================

// GET /api/admin/gdrive/auth — 구글 로그인을 위한 OAuth URL 반환
router.get('/gdrive/auth', adminMiddleware, (req, res) => {
    // Pass the raw admin token in state so the callback can verify it
    const token = req.headers.authorization?.split(' ')[1];
    const url = getAuthUrl(token);
    if (!url) {
        return res.status(500).json({ error: 'Google OAuth 환경변수가 누락되었습니다.' });
    }
    res.json({ url });
});

// GET /api/admin/gdrive/callback — 구글 로그인 후 리다이렉트 콜백
router.get('/gdrive/callback', async (req, res) => {
    try {
        const { code, state, error } = req.query;
        if (error) return res.send(`구글 로그인 실패: ${error}`);

        // Verify that the person who clicked login is our admin by checking the state JWT
        try {
            const decoded = jwt.verify(state, process.env.JWT_SECRET);
            if (!decoded.isAdmin) throw new Error('Not admin');
        } catch (e) {
            return res.status(403).send('관리자 권한 인증에 실패했습니다.');
        }

        const oauth2Client = getOAuth2Client();
        const { tokens } = await oauth2Client.getToken(code);

        // Save tokens to DB securely
        await Config.findOneAndUpdate(
            { key: 'gdrive_tokens' },
            { value: tokens },
            { upsert: true }
        );

        // Redirect back to home (the frontend will reload and see the connected status)
        res.redirect('/');
    } catch (err) {
        console.error('Google Callback Error:', err);
        res.status(500).send('콜백 처리 중 오류가 발생했습니다.');
    }
});

// GET /api/admin/gdrive/status — 현재 구글 드라이브 연동 상태 확인
router.get('/gdrive/status', adminMiddleware, async (req, res) => {
    try {
        const config = await Config.findOne({ key: 'gdrive_tokens' });
        res.json({ connected: !!config });
    } catch (err) {
        console.error('Status check error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/admin/gdrive/disconnect — 구글 드라이브 연동 끊기
router.delete('/gdrive/disconnect', adminMiddleware, async (req, res) => {
    try {
        await Config.findOneAndDelete({ key: 'gdrive_tokens' });
        res.json({ message: '연동이 안전하게 해제되었습니다.' });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ==========================================
// ADMIN DASHBOARD ROUTES
// ==========================================

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

        if (worksheet.filePublicId) {
            if (worksheet.storageType === 'gdrive') {
                const config = await Config.findOne({ key: 'gdrive_tokens' });
                if (config) await deleteFromGoogleDrive(worksheet.filePublicId, config.value);
            } else {
                await cloudinary.uploader.destroy(worksheet.filePublicId);
            }
        }
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
        const gdriveConfig = await Config.findOne({ key: 'gdrive_tokens' });

        for (const w of worksheets) {
            if (w.filePublicId) {
                if (w.storageType === 'gdrive' && gdriveConfig) {
                    await deleteFromGoogleDrive(w.filePublicId, gdriveConfig.value);
                } else {
                    await cloudinary.uploader.destroy(w.filePublicId);
                }
            }
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

// GET /api/admin/quizzes — 전체 퀴즈 목록 (관리자)
router.get('/quizzes', adminMiddleware, async (req, res) => {
    try {
        const Quiz = require('../models/Quiz');
        const quizzes = await Quiz.find()
            .populate('creator', 'username')
            .populate('subject', 'name')
            .sort({ createdAt: -1 });
        res.json(quizzes);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/admin/quizzes/:id — 퀴즈 삭제 (관리자)
router.delete('/quizzes/:id', adminMiddleware, async (req, res) => {
    try {
        const Quiz = require('../models/Quiz');
        const QuizScore = require('../models/QuizScore');
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) return res.status(404).json({ error: '퀴즈를 찾을 수 없습니다.' });

        await QuizScore.deleteMany({ quiz: quiz._id });
        await Quiz.findByIdAndDelete(req.params.id);

        res.json({ message: `퀴즈 "${quiz.title}" 및 관련 플레이 기록 삭제 완료!` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/admin/storage — 저장 공간 현황
router.get('/storage', adminMiddleware, async (req, res) => {
    try {
        const info = { cloudinary: null, mongodb: null, gdrive: false };

        // Cloudinary 사용량
        try {
            const usage = await cloudinary.api.usage();
            info.cloudinary = {
                usedStorage: usage.storage?.usage || 0,
                totalStorage: usage.storage?.limit || 0,
                usedCredits: usage.credits?.usage || 0,
                totalCredits: usage.credits?.limit || 0,
                usedBandwidth: usage.bandwidth?.usage || 0,
                totalBandwidth: usage.bandwidth?.limit || 0,
                resources: usage.resources || 0,
            };
        } catch (e) {
            console.error('Cloudinary usage error:', e.message);
        }

        // MongoDB 통계
        const worksheetCount = await Worksheet.countDocuments();
        const userCount = await User.countDocuments();
        const subjectCount = await Subject.countDocuments();
        info.mongodb = { worksheetCount, userCount, subjectCount };

        // Google Drive 연동 여부
        const gdriveConfig = await Config.findOne({ key: 'gdrive_tokens' });
        info.gdrive = !!gdriveConfig;

        res.json(info);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
