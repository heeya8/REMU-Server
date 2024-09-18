const { StatusCodes } = require('http-status-codes');
const conn = require('./mariadb');
const dotenv = require('dotenv');

dotenv.config();

const addition = async (req, res) => {
    try {
        // 토큰을 통해 얻은 user_id
        const userId = req.decoded.id;

        // 요청에서 받아온 공연 정보
        const { prfnm, pf_id, title, content, rating } = req.body;

        // 필수 필드 검증
        if (!title || !content || !rating || !prfnm || !pf_id) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: "모든 필드를 입력해주세요."
            });
        }

        // 리뷰 데이터 삽입
        const insertQuery = `INSERT INTO review (user_id, title, content, rating, prfnm, pf_id) VALUES (?, ?, ?, ?, ?, ?)`;
        await conn.query(insertQuery, [userId, title, content, rating, prfnm, pf_id]);

        return res.status(StatusCodes.CREATED).json({message: "리뷰가 성공적으로 작성되었습니다."});

    } catch (error) {
        console.error('오류 발생:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: '리뷰를 작성하는 중 오류가 발생했습니다.' });
    }
};

const updateReview = async (req, res) => {
    try {
        // 인증된 사용자의 user_id
        const userId = req.decoded.id;

        // 요청으로부터 필요한 데이터 추출
        const reviewId = req.params.id;
        const { title, content, rating } = req.body;

        // 수정할 리뷰가 현재 로그인한 사용자의 것인지 확인
        const reviewQuery = 'SELECT user_id FROM review WHERE review_id = ?';
        const reviewResult = await conn.query(reviewQuery, [reviewId]);

        if (reviewResult.length === 0) {
            return res.status(StatusCodes.NOT_FOUND).json({message: '해당 리뷰를 찾을 수 없습니다.'});
        }

        const reviewOwnerId = reviewResult[0].user_id;
        if (userId !== Number(reviewOwnerId)) {  // BigInt -> Number 변환
            return res.status(StatusCodes.FORBIDDEN).json({message: '이 리뷰를 수정할 권한이 없습니다.'});
        }

        // 필드 수정
        const updateFields = {};
        if (title) updateFields.title = title;
        if (content) updateFields.content = content;
        if (rating !== undefined) updateFields.rating = rating;

        // 수정할 필드가 있는지 확인
        if (Object.keys(updateFields).length === 0) {
            return res.status(StatusCodes.BAD_REQUEST).json({message: '수정할 필드가 없습니다.'});
        }

        // 리뷰 업데이트 쿼리 동적 생성
        const setClause = Object.keys(updateFields).map(field => `${field} = ?`).join(', ');
        const updateQuery = `UPDATE review SET ${setClause} WHERE review_id = ?`;

        // 쿼리에 사용할 값 배열 생성
        const updateValues = [...Object.values(updateFields), reviewId];
        await conn.query(updateQuery, updateValues);

        return res.status(StatusCodes.OK).json({message: '리뷰가 성공적으로 수정되었습니다.'});

    } catch (error) {
        console.error('리뷰 수정 중 오류 발생:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({message: '리뷰를 수정하는 중 오류가 발생했습니다.'});
    }
};

const deleteReview = async (req, res) => {
    try {
        const reviewId = req.params.id;

        // 해당 리뷰의 작성자와 현재 사용자가 일치하는지 확인
        const [review] = await conn.query('SELECT * FROM review WHERE review_id = ?', [reviewId]);
        if (!review) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: '리뷰를 찾을 수 없습니다.' });
        }

        if (review.user_id !== req.decoded.id) {
            return res.status(StatusCodes.FORBIDDEN).json({ message: '삭제 권한이 없습니다.' });
        }

        // 리뷰 삭제
        const deleteQuery = 'DELETE FROM review WHERE review_id = ?';
        await conn.query(deleteQuery, [reviewId]);

        return res.status(StatusCodes.OK).json({ message: "리뷰가 성공적으로 삭제되었습니다." });

    } catch (error) {
        console.error('오류 발생:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: '리뷰를 삭제하는 중 오류가 발생했습니다.'
        });
    }
};

module.exports = {
    addition,
    updateReview,
    deleteReview
};
