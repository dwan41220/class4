const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '인증이 필요합니다.' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
}

function adminMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.isAdmin) return res.status(403).json({ error: '관리자 권한이 없습니다.' });
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }
}

module.exports = { authMiddleware, adminMiddleware };
