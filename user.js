const { StatusCodes } = require('http-status-codes');
const conn = require('./mariadb');
const dotenv = require('dotenv');

dotenv.config();

// 사용자 정보 조회
const getUserInfo = async (req, res) => {
    try {
        // JWT에서 사용자 ID 추출
        const userId = req.decoded.id;

        // DB에서 ID 기반으로 사용자 정보 조회
        const [user] = await conn.query('SELECT email, nickname FROM user WHERE user_id = ?', [userId]);

        if (!user) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: '사용자를 찾을 수 없습니다.' });
        }

        // 사용자 정보를 응답으로 반환
        return res.status(StatusCodes.OK).json({
            email: user.email,
            nickname: user.nickname
        });
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '서버 오류' });
    }
};

// 사용자가 작성한 리뷰 조회
const getUserReviews = async (req, res) => {
    try {
        // JWT에서 사용자 ID 추출
        const userId = req.decoded.id;

        // 해당 유저가 작성한 리뷰 조회
        const reviews = await conn.query(
            'SELECT * FROM review WHERE user_id = ?',
            [userId]
        );

        // 작성한 리뷰 없으면 빈 배열 반환
        if (!reviews.length) {
            return res.status(StatusCodes.OK).json({ reviews: [] });
        }

        // 리뷰 정보를 응답으로 반환
        return res.status(StatusCodes.OK).json({ reviews });

    } catch (error) {
        console.error('사용자 리뷰 조회 오류:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '서버 오류' });
    }
};

const patchUserInfo = async (req, res) => {
    try {
        // JWT에서 사용자 ID 추출
        const userId = req.decoded.id;

        // 사용자 입력값 추출
        const { email, nickname } = req.body;

        // 입력값 유효성 검사 (간단한 예시)
        if (!email || !nickname) {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: '이메일과 닉네임은 필수입니다.' });
        }

        // 이메일 중복 확인
        const [emailResults] = await conn.query('SELECT user_id FROM user WHERE email = ? AND user_id != ?', [email, userId]);
        if (emailResults && emailResults.length > 0) {
            return res.status(StatusCodes.CONFLICT).json({ message: '이메일이 이미 사용 중입니다.' });
        }

        // 닉네임 중복 확인
        const [nicknameResults] = await conn.query('SELECT user_id FROM user WHERE nickname = ? AND user_id != ?', [nickname, userId]);
        if (nicknameResults && nicknameResults.length > 0) {
            return res.status(StatusCodes.CONFLICT).json({ message: '닉네임이 이미 사용 중입니다.' });
        }

        // 사용자 정보 업데이트
        const result = await conn.query('UPDATE user SET email = ?, nickname = ? WHERE user_id = ?', [email, nickname, userId]);

        if (result.affectedRows === 0) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: '사용자 정보 업데이트 실패' });
        }

        // 응답 반환
        return res.status(StatusCodes.OK).json({ message: '성공적으로 변경되었습니다.' });
    } catch (error) {
        console.error('사용자 정보 수정 오류:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '서버 오류' });
    }
};

module.exports = {
    getUserInfo,
    getUserReviews,
    patchUserInfo
};