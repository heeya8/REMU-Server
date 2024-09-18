const { StatusCodes } = require('http-status-codes');
const conn = require('./mariadb');
const dotenv = require('dotenv');
const axios = require('axios');
const xml2js = require('xml2js'); // xml -> json 변환 모듈

dotenv.config();

const searchPerformances = async (req, res) => {
    const serviceKey = process.env.SERVICE_KEY;
    const prfnm = req.query.text || '';
    const page = parseInt(req.query.page) || 1;
    const category = req.query.category || '전체';
    const categoryMap = {
        "전체": "", "연극": "AAAA", "무용": "BBBC", "대중무용": "BBBE", "서양음악": "CCCA", "한국음악": "CCCC", "대중음악": "CCCD", "복합": "EEEA", "서커스/마술": "EEEB", "뮤지컬": "GGGA"
    };
    const rowsPerPage = 10; // 한 페이지에 표시할 공연 수

    try {
        const apiUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?service=${serviceKey}&shprfnm=${encodeURIComponent(prfnm)}&shcate=${categoryMap[category]}&cpage=${page}&rows=${rowsPerPage}&newsql=Y`;
        const response = await axios.get(apiUrl);
        const xmlData = response.data;
        const jsonData = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
        let performances = jsonData.dbs.db;

        if (!performances || (Array.isArray(performances) && performances.length === 0)) {
            return res.status(StatusCodes.OK).json({
                text: prfnm,
                category: category,
                page: page,
                total_pages: 0,
                last_page: true,
                performance_results: [],
                message: '검색 결과가 존재하지 않습니다.'
            });
        }

        if (!Array.isArray(performances)) {
            performances = [performances];
        }

        // 전체 페이지 수를 계산하는 대신 다음 페이지 유무를 판단(page와 totalPages의 숫자가 같으면 마지막 페이지)
        const totalPages = performances.length < rowsPerPage ? page : page + 1;

        // 공연 아이디 추출 후 배열 생성
        const performanceId = performances.map(performance => performance.mt20id);
        console.log('performanceId:', performanceId);
        
        // 공연 평점 조회
        const query = 'SELECT pf_id, AVG(rating) as avgRating FROM review WHERE pf_id IN (?) GROUP BY pf_id';
        const result = await conn.query(query, [performanceId]);
        console.log('result:', result);
    
        // 공연 아이디와 평균 평점 매핑
        const ratingMap = {};
        result.forEach(row => {
            ratingMap[row.pf_id] = parseFloat(row.avgRating).toFixed(1); // 소수점 이하 첫째 자리까지
        });
        console.log('ratingMap:', ratingMap);
    
        // 공연 목록에 평점 추가
        const performance_results = performances.map(performance => ({
            poster: performance.poster,
            pf_id: performance.mt20id,
            prfnm: performance.prfnm,
            rating: parseFloat(ratingMap[performance.mt20id] || 0.0)
        }));

        return res.status(StatusCodes.OK).json({
            text: prfnm,
            category: category,
            page: page,
            total_pages: totalPages,
            last_page: page == totalPages ? true : false, // page와 totalPages의 숫자가 같으면 마지막 페이지(true)
            performance_results: performance_results
        });

    } catch (err) {
        console.log(err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '검색 결과를 불러오는 중 오류가 발생했습니다.' });
    }
};

module.exports = {
    searchPerformances
};
