const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AdminConfig = require('../models/AdminConfig');
const User = require('../models/User');

// GET /api/auth/check/:username — 계정 존재 여부 + 활성화 상태
router.get('/check/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username });
        if (!user) return res.json({ exists: false });
        res.json({ exists: true, isActivated: user.isActivated });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/auth/activate — 첫 로그인: 비밀번호 설정
router.post('/activate', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: '계정 이름과 비밀번호를 입력하세요.' });
        if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: '존재하지 않는 계정입니다.' });
        if (user.isActivated) return res.status(400).json({ error: '이미 비밀번호가 설정된 계정입니다.' });

        user.passwordHash = await bcrypt.hash(password, 10);
        user.isActivated = true;
        await user.save();

        const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: '비밀번호 설정 완료!', token, user: { id: user._id, username: user.username, points: user.points } });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/auth/login — 로그인
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: '계정 이름과 비밀번호를 입력하세요.' });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ error: '존재하지 않는 계정입니다.' });
        if (!user.isActivated) return res.status(400).json({ error: '아직 비밀번호가 설정되지 않은 계정입니다. 먼저 비밀번호를 설정하세요.' });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });

        const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username: user.username, points: user.points } });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/admin/status — 관리자 셋업 여부
router.get('/admin-status', async (req, res) => {
    try {
        const admin = await AdminConfig.findOne();
        res.json({ isSetup: !!admin });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/auth/admin-setup — 최초 관리자 셋업
router.post('/admin-setup', async (req, res) => {
    try {
        const existing = await AdminConfig.findOne();
        if (existing) return res.status(400).json({ error: '이미 관리자가 설정되어 있습니다.' });

        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: '아이디와 비밀번호를 입력하세요.' });

        const passwordHash = await bcrypt.hash(password, 10);
        await AdminConfig.create({ username, passwordHash });

        const token = jwt.sign({ isAdmin: true, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ message: '관리자 설정 완료!', token });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/auth/admin-login — 관리자 로그인
router.post('/admin-login', async (req, res) => {
    try {
        const admin = await AdminConfig.findOne();
        if (!admin) return res.status(400).json({ error: '관리자가 설정되지 않았습니다.' });

        const { username, password } = req.body;
        if (admin.username !== username) return res.status(401).json({ error: '아이디가 일치하지 않습니다.' });

        const valid = await bcrypt.compare(password, admin.passwordHash);
        if (!valid) return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });

        const token = jwt.sign({ isAdmin: true, username }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
