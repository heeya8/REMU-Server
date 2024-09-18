const { StatusCodes } = require('http-status-codes');
const conn = require('./mariadb');
const dotenv = require('dotenv');
const axios = require('axios');
const xml2js = require('xml2js'); // xml -> json 변환 모듈

dotenv.config();

const getDetailAndReviews = async (req, res) => {
    const serviceKey = process.env.SERVICE_KEY;
    const prfId = req.query.prfId;
    const page = parseInt(req.query.page) || 1;
    const rowsPerPage = 5; // 한 페이지에 표시할 리뷰 수

    try {
        // 1. 공연 세부 정보 조회
        const apiUrl = `https://www.kopis.or.kr/openApi/restful/pblprfr/${prfId}?service=${serviceKey}&newsql=Y`;
        const response = await axios.get(apiUrl);
        const xmlData = response.data;
        const jsonData = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
        let performance = jsonData.dbs.db;

        if (!Array.isArray(performance)) {
            performance = [performance];
        }

        // 공연 평점 조회
        const query = 'SELECT AVG(rating) as avgRating FROM review WHERE pf_id IN (?) GROUP BY pf_id';
        const result = await conn.query(query, [prfId]);

        const rating_avg = result[0] ? parseFloat(result[0].avgRating).toFixed(1) : null;

        // 리뷰 조회 (페이징 처리)
        const offset = (page - 1) * rowsPerPage;
        const reviewQuery = `
            SELECT review_id, user_id, title, content, rating, created_at 
            FROM review 
            WHERE pf_id = ? 
            LIMIT ? OFFSET ?
        `;
        const rResult = await conn.query(reviewQuery, [prfId, rowsPerPage, offset]);

        // 리뷰에 해당하는 유저 닉네임 조회
        const userIds = rResult.map(result => Number(result.user_id)); // BigInt -> Number 변환
        let reviewData = [];

        if (userIds.length > 0) {
            const userQuery = 'SELECT user_id, nickname FROM user WHERE user_id IN (?)';
            const uResult = await conn.query(userQuery, [userIds]);

            // 유저 닉네임 매핑
            const nicknameMap = {};
            uResult.forEach(user => {
                nicknameMap[Number(user.user_id)] = user.nickname; // BigInt -> Number 변환
            });

            // 리뷰 데이터를 닉네임과 함께 구성
            reviewData = rResult.map(review => ({
                review_id: Number(review.review_id), // BigInt -> Number 변환
                user_nickname: nicknameMap[Number(review.user_id)] || 'Unknown', // BigInt -> Number 변환
                title: review.title,
                content: review.content,
                rating: parseFloat(review.rating),
                created_at: review.created_at
            }));
        }

        // 총 리뷰 수 조회 (페이지 계산을 위해 필요)
        const countQuery = 'SELECT COUNT(*) as total FROM review WHERE pf_id = ?';
        const countResult = await conn.query(countQuery, [prfId]);
        const totalReviews = Number(countResult[0].total); // BigInt -> Number 변환
        const totalPages = Math.ceil(totalReviews / rowsPerPage);

        return res.status(StatusCodes.OK).json({
            performance: {
                prfnm: performance[0].prfnm,
                genrenm: performance[0].genrenm,
                prfpdfrom: performance[0].prfpdfrom,
                prfpdto: performance[0].prfpdto,
                poster: performance[0].poster,
                prfstate: performance[0].prfstate,
                rating_avg: rating_avg ? parseFloat(rating_avg) : null
            },
            reviews: {
                page: page,
                total_pages: totalPages,
                data: reviewData
            }
        });

    } catch (error) {
        console.error('오류 발생:', error);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: '공연 세부정보와 리뷰를 불러오는 중 오류가 발생했습니다.'
        });
    }
}

module.exports = {
    getDetailAndReviews
};
