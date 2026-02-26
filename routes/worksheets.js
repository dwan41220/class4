const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const Worksheet = require('../models/Worksheet');
const View = require('../models/View');
const User = require('../models/User');
const PointTransaction = require('../models/PointTransaction');
const { authMiddleware } = require('../middleware/auth');
const { uploadFile, uploadImage, cloudinary } = require('../config/cloudinary');
const multer = require('multer');

// POST /api/worksheets — 업로드 (파일 + 썸네일)
const uploadFields = (req, res, next) => {
    const upload = multer({
        storage: require('../config/cloudinary').uploadFile.storage,
        limits: { fileSize: 50 * 1024 * 1024 },
    }).fields([
        { name: 'file', maxCount: 1 },
        { name: 'thumbnail', maxCount: 1 },
    ]);
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ error: '파일 업로드 실패: ' + err.message });
        next();
    });
};

router.post('/', authMiddleware, uploadFields, async (req, res) => {
    try {
        const { title, subjectId, externalUrl } = req.body;
        if (!title || !subjectId) return res.status(400).json({ error: '제목과 과목을 입력하세요.' });
        if (!req.files?.file?.[0] && !externalUrl) return res.status(400).json({ error: '파일을 선택하거나 외부 링크를 입력하세요.' });

        const worksheet = await Worksheet.create({
            title,
            subject: subjectId,
            fileUrl: req.files?.file?.[0]?.path || null,
            filePublicId: req.files?.file?.[0]?.filename || null,
            externalUrl: externalUrl || null,
            thumbnailUrl: req.files?.thumbnail?.[0]?.path || null,
            thumbnailPublicId: req.files?.thumbnail?.[0]?.filename || null,
            uploader: req.user.userId,
        });

        await worksheet.populate('subject');
        await worksheet.populate('uploader', 'username');
        res.json({ message: '업로드 완료!', worksheet });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/worksheets — 목록 조회 (과목별, 정렬)
router.get('/', async (req, res) => {
    try {
        const { subject, sort } = req.query;
        const filter = subject ? { subject } : {};
        const sortOption = sort === 'views' ? { views: -1 } : { createdAt: -1 };

        const worksheets = await Worksheet.find(filter)
            .populate('subject', 'name')
            .populate('uploader', 'username')
            .sort(sortOption);

        res.json(worksheets);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/worksheets/:id — 상세 조회 → 조회수 +1 & 포인트 지급
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const worksheet = await Worksheet.findById(req.params.id)
            .populate('subject', 'name')
            .populate('uploader', 'username points');
        if (!worksheet) return res.status(404).json({ error: '학습지를 찾을 수 없습니다.' });

        let viewCounted = false;

        // 본인 조회 불가, 계정당 1회 제한
        if (worksheet.uploader._id.toString() !== req.user.userId) {
            const existingView = await View.findOne({ worksheet: worksheet._id, viewer: req.user.userId });
            if (!existingView) {
                await View.create({ worksheet: worksheet._id, viewer: req.user.userId });
                worksheet.views += 1;
                await worksheet.save();

                // 업로더에게 100포인트 지급
                const uploader = await User.findById(worksheet.uploader._id);
                uploader.points += 100;
                uploader.totalEarned += 100;
                await uploader.save();

                await PointTransaction.create({
                    toUser: uploader._id,
                    fromUser: req.user.userId,
                    amount: 100,
                    type: 'VIEW_REWARD',
                    description: `"${worksheet.title}" 조회 보상`,
                });

                viewCounted = true;
            }
        }

        res.json({ worksheet, viewCounted });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/worksheets/:id/download — 파일 다운로드 (서버 프록시)
router.get('/:id/download', authMiddleware, async (req, res) => {
    try {
        const worksheet = await Worksheet.findById(req.params.id);
        if (!worksheet) return res.status(404).json({ error: '학습지를 찾을 수 없습니다.' });

        // 외부 링크인 경우 바로 리다이렉트 (클라이언트에서 새 창 열기)
        if (worksheet.externalUrl) {
            return res.json({ externalUrl: worksheet.externalUrl });
        }

        let fileUrl = worksheet.fileUrl;
        if (!fileUrl) return res.status(404).json({ error: '파일 URL이 없습니다.' });

        // 파일 확장자 추출
        const urlPath = new URL(fileUrl).pathname;
        const ext = urlPath.match(/\.(\w+)$/)?.[1] || 'pdf';
        const safeName = worksheet.title.replace(/[^\w가-힣\s\-_.]/g, '') || 'download';
        const fileName = `${safeName}.${ext}`;

        // MIME 타입 매핑
        const mimeTypes = {
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
        };
        const contentType = mimeTypes[ext.toLowerCase()] || 'application/octet-stream';

        const response = await fetch(fileUrl, {
            headers: {
                'User-Agent': 'Node.js Proxy',
                'Accept': '*/*, application/pdf'
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: `파일을 가져올 수 없습니다. (${response.status})`, details: errText });
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);

        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        res.send(buffer);
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// PATCH /api/worksheets/:id/thumbnail — 표지 이미지 변경
router.patch('/:id/thumbnail', authMiddleware, uploadImage.single('thumbnail'), async (req, res) => {
    try {
        const worksheet = await Worksheet.findById(req.params.id);
        if (!worksheet) return res.status(404).json({ error: '학습지를 찾을 수 없습니다.' });
        if (worksheet.uploader.toString() !== req.user.userId) return res.status(403).json({ error: '업로더만 표지를 변경할 수 있습니다.' });

        if (worksheet.thumbnailPublicId) {
            await cloudinary.uploader.destroy(worksheet.thumbnailPublicId);
        }
        worksheet.thumbnailUrl = req.file ? req.file.path : worksheet.thumbnailUrl;
        worksheet.thumbnailPublicId = req.file ? req.file.filename : worksheet.thumbnailPublicId;
        await worksheet.save();
        res.json({ message: '표지 변경 완료!', worksheet });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
