const express = require('express');
const router = express.Router();
const https = require('https');
const http = require('http');
const Worksheet = require('../models/Worksheet');
const View = require('../models/View');
const User = require('../models/User');
const PointTransaction = require('../models/PointTransaction');
const Config = require('../models/Config');
const { authMiddleware } = require('../middleware/auth');
const { uploadFile, uploadImage, cloudinary } = require('../config/cloudinary');
const { drive, uploadToGoogleDrive } = require('../config/gdrive');
const multer = require('multer');

// POST /api/worksheets — 업로드 (파일 + 썸네일)
const uploadFields = (req, res, next) => {
    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 120 * 1024 * 1024 }, // 120MB Limit
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
        const { title, subjectId } = req.body;
        if (!title || !subjectId) return res.status(400).json({ error: '제목과 과목을 입력하세요.' });
        if (!req.files?.file?.[0]) return res.status(400).json({ error: '파일을 선택하세요.' });

        const mainFile = req.files.file[0];
        const thumbFile = req.files.thumbnail?.[0];

        let fileUrl = '';
        let filePublicId = '';
        let storageType = 'cloudinary';

        // 1. Upload Main File
        const isImageOrVideo = mainFile.mimetype.startsWith('image/') || mainFile.mimetype.startsWith('video/');

        if (isImageOrVideo) {
            // Cloudinary Upload
            const uploadResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'smart-worksheet-hub/files', resource_type: 'auto' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(mainFile.buffer);
            });
            fileUrl = uploadResult.secure_url;
            filePublicId = uploadResult.public_id;
            storageType = 'cloudinary';
        } else {
            // Check Google Drive Tokens
            const gdriveConfig = await Config.findOne({ key: 'gdrive_tokens' });
            if (!gdriveConfig) {
                return res.status(400).json({ error: '관리자가 구글 드라이브 연동을 완료하지 않아 문서 업로드가 불가능합니다.' });
            }

            // Google Drive Upload
            const gdriveResult = await uploadToGoogleDrive(mainFile.buffer, mainFile.originalname, mainFile.mimetype, gdriveConfig.value);
            fileUrl = gdriveResult.webContentLink; // Direct download link
            filePublicId = gdriveResult.fileId;
            storageType = 'gdrive';
        }

        // 2. Upload Thumbnail (Always Cloudinary)
        let thumbUrl = null;
        let thumbPublicId = null;

        if (thumbFile) {
            const thumbResult = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'smart-worksheet-hub/thumbnails', resource_type: 'image' },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(thumbFile.buffer);
            });
            thumbUrl = thumbResult.secure_url;
            thumbPublicId = thumbResult.public_id;
        }

        // 3. Save to DB
        const worksheet = await Worksheet.create({
            title,
            subject: subjectId,
            fileUrl,
            filePublicId,
            storageType,
            thumbnailUrl: thumbUrl,
            thumbnailPublicId: thumbPublicId,
            uploader: req.user.userId,
        });

        await worksheet.populate('subject');
        await worksheet.populate('uploader', 'username');
        res.json({ message: '업로드 완료!', worksheet });
    } catch (err) {
        console.error('Upload error:', err);
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

        if (!worksheet.fileUrl) {
            return res.status(404).json({ error: '파일 URL이 존재하지 않습니다.' });
        }

        // Direct users straight to the Cloudinary/Google Drive link for downloading.
        // This is much faster and saves server memory/bandwidth compared to proxying large ArrayBuffers.
        res.json({ url: worksheet.fileUrl });

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
