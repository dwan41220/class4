const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Follow = require('../models/Follow');
const PointTransaction = require('../models/PointTransaction');
const { authMiddleware } = require('../middleware/auth');

// POST /api/points/transfer — 포인트 전송 (수수료 8%)
router.post('/transfer', authMiddleware, async (req, res) => {
    try {
        const { toUserId, amount } = req.body;
        if (!toUserId || !amount || amount <= 0) return res.status(400).json({ error: '받는 사람과 포인트를 입력하세요.' });
        if (toUserId === req.user.userId) return res.status(400).json({ error: '자기 자신에게 전송할 수 없습니다.' });

        // 친구(팔로잉) 확인
        const isFollowing = await Follow.findOne({ follower: req.user.userId, following: toUserId });
        if (!isFollowing) return res.status(400).json({ error: '팔로우한 친구에게만 포인트를 보낼 수 있습니다.' });

        const fee = Math.ceil(amount * 0.08);
        const totalCost = amount + fee;

        const sender = await User.findById(req.user.userId);
        if (sender.points < totalCost) {
            return res.status(400).json({ error: `잔액이 부족합니다. 필요: ${totalCost}pt (전송 ${amount}pt + 수수료 ${fee}pt), 보유: ${sender.points}pt` });
        }

        const receiver = await User.findById(toUserId);
        if (!receiver) return res.status(404).json({ error: '받는 사람을 찾을 수 없습니다.' });

        // 포인트 처리
        sender.points -= totalCost;
        receiver.points += amount;
        receiver.totalEarned += amount;
        await sender.save();
        await receiver.save();

        // 거래 기록
        await PointTransaction.create({
            fromUser: sender._id,
            toUser: receiver._id,
            amount,
            type: 'TRANSFER',
            description: `${sender.username} → ${receiver.username} 전송`,
        });

        await PointTransaction.create({
            fromUser: sender._id,
            toUser: sender._id,
            amount: -fee,
            type: 'FEE',
            description: `전송 수수료 8% (${fee}pt 소멸)`,
        });

        res.json({
            message: `${receiver.username}에게 ${amount}pt 전송 완료! (수수료 ${fee}pt)`,
            senderPoints: sender.points,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/points/history — 포인트 거래 이력
// VIEW_REWARD, ADMIN_ADJUST → 받는 사람(toUser)에게만 표시
// TRANSFER, FEE → 보내는 사람(fromUser)에게도 표시
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const transactions = await PointTransaction.find({
            $or: [
                { toUser: req.user.userId, type: { $in: ['VIEW_REWARD', 'ADMIN_ADJUST'] } },
                { toUser: req.user.userId, type: 'TRANSFER' },
                { fromUser: req.user.userId, type: { $in: ['TRANSFER', 'FEE'] } },
            ],
        })
            .populate('fromUser', 'username')
            .populate('toUser', 'username')
            .sort({ createdAt: -1 })
            .limit(50);

        res.json(transactions);
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
