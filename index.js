require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '120mb' }));
app.use(express.urlencoded({ limit: '120mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/subjects', require('./routes/subjects'));
app.use('/api/worksheets', require('./routes/worksheets'));
app.use('/api/users', require('./routes/users'));
app.use('/api/follows', require('./routes/follows'));
app.use('/api/points', require('./routes/points'));
app.use('/api/quizzes', require('./routes/quizzes'));

// SPA fallback
app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ MongoDB 연결 성공!');

        // 주간 리더보드 1등 자동 보상 체크
        await checkWeeklyReward();
        // 6시간마다 반복 체크
        setInterval(checkWeeklyReward, 6 * 60 * 60 * 1000);

        app.listen(PORT, () => {
            console.log(`🚀 서버 실행 중: http://localhost:${PORT}`);
            // 서버 깨우기 봇 시작
            startKeepAlive();
        });
    })
    .catch(err => {
        console.error('❌ MongoDB 연결 실패:', err.message);
    });

// 주간 퀴즈 1등 자동 1000pt 지급
async function checkWeeklyReward() {
    try {
        const Config = require('./models/Config');
        const QuizScore = require('./models/QuizScore');
        const User = require('./models/User');
        const PointTransaction = require('./models/PointTransaction');

        // 지난주 월요일 ~ 이번주 월요일 계산
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=일, 1=월 ...
        const thisMonday = new Date(now);
        thisMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        thisMonday.setHours(0, 0, 0, 0);

        const lastMonday = new Date(thisMonday);
        lastMonday.setDate(thisMonday.getDate() - 7);

        // 이미 이번 주기에 보상을 줬는지 확인
        const rewardKey = `weekly_reward_${lastMonday.toISOString().split('T')[0]}`;
        const existing = await Config.findOne({ key: rewardKey });
        if (existing) return; // 이미 지급함

        // 지난주 1등 찾기
        const leaderboard = await QuizScore.aggregate([
            { $match: { playedAt: { $gte: lastMonday, $lt: thisMonday } } },
            { $group: { _id: '$player', totalScore: { $sum: '$score' } } },
            { $sort: { totalScore: -1 } },
            { $limit: 1 },
        ]);

        if (leaderboard.length === 0) {
            console.log('📊 지난주 퀴즈 플레이 기록 없음 — 보상 스킵');
            return;
        }

        const winnerId = leaderboard[0]._id;
        const winnerScore = leaderboard[0].totalScore;

        const winner = await User.findById(winnerId);
        if (!winner) return;

        // 1000pt 지급
        winner.points += 1000;
        winner.totalEarned += 1000;
        await winner.save();

        await PointTransaction.create({
            toUser: winner._id,
            amount: 1000,
            type: 'WEEKLY_QUIZ_REWARD',
            description: `주간 퀴즈 랭킹 1등 보상 (${winnerScore}점)`,
        });

        // 중복 방지 플래그 저장
        await Config.create({ key: rewardKey, value: { winnerId: winner._id, score: winnerScore } });

        console.log(`🏆 주간 퀴즈 1등 보상 완료! ${winner.username} → 1000pt (${winnerScore}점)`);
    } catch (err) {
        console.error('주간 보상 체크 오류:', err.message);
    }
}

// 서버 깨우기 봇 (Keep-Alive)
function startKeepAlive() {
    const url = process.env.PING_URL;
    if (!url) {
        console.log('📡 [Keep-Alive] PING_URL이 설정되지 않아 봇을 시작하지 않습니다.');
        return;
    }

    console.log(`🤖 [Keep-Alive Bot] 작동 중... (대상: ${url})`);

    // 14분마다 핑 (Render 등 무료 티어 15분 미활동 시 중지 방지)
    setInterval(() => {
        const protocol = url.startsWith('https') ? require('https') : require('http');
        protocol.get(url, (res) => {
            console.log(`📡 [Keep-Alive] 핑 완료 (상태 코드: ${res.statusCode}) - ${new Date().toLocaleString()}`);
        }).on('error', (err) => {
            console.error('📡 [Keep-Alive] 핑 실패:', err.message);
        });
    }, 14 * 60 * 1000);
}
