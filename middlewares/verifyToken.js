const jwt = require('jsonwebtoken');
const conn = require('../mariadb');
const { StatusCodes } = require('http-status-codes');
const dotenv = require('dotenv');
const util = require('util');
dotenv.config();

const verifyJwt = util.promisify(jwt.verify);

// 토큰 생성
const generateToken = (user, secretKey, expiresIn) => {
    return jwt.sign({
        id: user.user_id,
        email: user.email
    }, secretKey, {
        expiresIn,
        issuer: 'remu'
    });
};

// 토큰 유효성 검증 및 재생성
const verifyToken = async (req, res, next) => {
    const accessToken = req.cookies.accessToken;
    const refreshToken = req.cookies.refreshToken;

    if (!accessToken) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Access Token이 없습니다.' });
    }

    try {
        req.decoded = await verifyJwt(accessToken, process.env.PRIVATE_KEY);
        console.log('Access Token 검증');
        return next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            console.log('Access Token 만료');
            if (!refreshToken) {
                return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Refresh Token이 없습니다.' });
            }

            try {
                const decodedRefreshToken = await verifyJwt(refreshToken, process.env.PRIVATE_KEY);

                // DB에서 이메일로 사용자 조회
                const [user] = await conn.query('SELECT * FROM user WHERE email = ?', [decodedRefreshToken.email]);
                if (!user) {
                    return res.status(StatusCodes.UNAUTHORIZED).json({ message: '사용자를 찾을 수 없습니다.' });
                }

                // 새로운 Access Token 발급(1m으로 변경 후 테스트 완료)
                const newAccessToken = generateToken(user, process.env.PRIVATE_KEY, '1h');
                res.cookie('accessToken', newAccessToken, { secure: process.env.NODE_ENV === 'production', maxAge: 604800 * 6, sameSite: 'Lax' });
                req.cookies.accessToken = newAccessToken;
                console.log('Access Token 재생성 후 쿠키 등록')
                req.decoded = await verifyJwt(newAccessToken, process.env.PRIVATE_KEY);
                return next();
            } catch (err) {
                // Refresh Token 만료 시 재로그인
                return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Refresh Token이 유효하지 않습니다.' });
            }
        }

        return res.status(StatusCodes.UNAUTHORIZED).json({ message: '토큰이 유효하지 않습니다.' });
    }
};

module.exports = verifyToken;
