const { StatusCodes } = require('http-status-codes');
const conn = require('./mariadb');
const dotenv = require('dotenv');
const axios = require('axios');
const xml2js = require('xml2js'); // xml -> json 변환 모듈

dotenv.config();

// 공연 이름으로 정보 검색
const fetchPerformanceDetails = async (serviceKey, performanceNames) => {
    const results = [];
    
    for (const name of performanceNames) {
        const apiUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?service=${serviceKey}&shprfnm=${encodeURIComponent(name)}&cpage=1&rows=10&prfstate=02&newsql=Y`;
        
        console.log(`Fetching API: ${apiUrl}`); // API 요청 URL 로그
        
        try {
            const response = await axios.get(apiUrl);
            const xmlData = response.data;
            
            console.log('API Response XML:', xmlData); // XML 응답 로그
            
            const jsonData = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
            console.log('Parsed JSON Data:', jsonData); // JSON 데이터 로그
            
            const performances = jsonData.dbs.db || [];
            console.log(`Performances for "${name}":`, performances); // 공연 데이터 로그
            
            if (performances.length > 0) {
                results.push(performances[0]); // 동일한 이름의 공연이 여러 개일 경우 첫 번째만 사용
            }else{
                results.push(performances);
            }

        } catch (error) {
            console.error(`API 요청 실패: ${error.message}`);
        }
    }

    return results;
};

// 현재 '공연중' 상태인 모든 공연을 포함한 배열 생성
const fetchAll = async(serviceKey, rows) => {
    let allprf = [];
    let hasMore = true;
    let currentPage = 1;

    // 날짜 지정X -> 받아오는 데이터가 많아 시간이 오래걸릴 수 있음
    const date = new Date();
    date.setDate(date.getDate() - 30);
    const stdate = date.toISOString().split('T')[0].replace(/-/g, '');

    //let apiUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?service=${serviceKey}&cpage=${currentPage}&rows=${rows}&prfstate=02&newsql=Y`;

    while (hasMore) {
        let apiUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?service=${serviceKey}&cpage=${currentPage}&rows=${rows}&stdate=${stdate}&prfstate=02&newsql=Y`;
        // 공연 목록 가져오기
        const response = await axios.get(apiUrl);
        const xmlData = response.data;
        // XML 데이터를 JSON으로 변환
        const jsonData = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
        const performances = jsonData.dbs.db; // 공연 목록

        if (performances && performances.length > 0) {
            allprf = allprf.concat(performances);
            currentPage += 1;
        } else {
            hasMore = false;
        }
    }
    return allprf;
}

// 공연 최신순 정렬
const latestSorting = async (serviceKey, page, rows) => {

    const allprf = await fetchAll(serviceKey, rows, true);

    // 최신순 정렬 후 페이지네이션 처리
    allprf.sort((a, b) => new Date(b.prfpdfrom) - new Date(a.prfpdfrom));
    const startIndex = (page - 1) * rows; // 페이지 당 공연의 개수를 계산해 인덱스로 처리
    const endIndex = startIndex + rows;
    const paginatedPrfs = allprf.slice(startIndex, endIndex);
    console.log('paginatedPerformances: ', paginatedPrfs);
    
    return paginatedPrfs;
};

// 공연 인기순 정렬
const popularSorting = async (serviceKey, page, rows) => {
    const query = `
        SELECT prfnm, COUNT(*) as reviewCount
        FROM review
        GROUP BY prfnm
        ORDER BY reviewCount DESC
        LIMIT ?, ?
    `;
    const results = await conn.query(query, [(page - 1) * rows, rows]);

    console.log('Popular Sorting DB Results:', results);

    if (results.length === 0) {
        return [];
    }

    const performanceNames = results.map(row => row.prfnm);
    console.log('Performance Names:', performanceNames);

    let performances = await fetchPerformanceDetails(serviceKey, performanceNames);
    console.log('performances: ', performances);

    // 공연 이름과 리뷰 개수 매핑
    const reviewCountMap = {};
    results.forEach(row => {
        reviewCountMap[row.prfnm] = row.reviewCount.toString(); // Json에서 BigInt를 직접 지원하지 않아 문자열로 변환
    });

    const queryRating = 'SELECT prfnm, AVG(rating) as avgRating FROM review WHERE prfnm IN (?) GROUP BY prfnm';
    const ratingResults = await conn.query(queryRating, [performanceNames]);

    // 공연 이름과 평균 평점 매핑
    const ratingMap = {};
    ratingResults.forEach(row => {
        ratingMap[row.prfnm] = parseFloat(row.avgRating).toFixed(1); // 소수점 이하 첫째 자리까지
    });
    console.log('ratingMap: ', ratingMap);

    // JSON 포맷 설정
    return performances.map(performance => ({
        poster: performance.poster,
        prfnm: performance.prfnm,
        rating: ratingMap[performance.prfnm] || 0.0,
        reviewCount: reviewCountMap[performance.prfnm] || '0'
    }));
};

// 공연 평점순 정렬
const topRatedSorting = async (serviceKey, page, rows) => {
    const query = `
        SELECT prfnm, AVG(rating) as avgRating
        FROM review
        GROUP BY prfnm
        ORDER BY avgRating DESC
        LIMIT ?, ?
    `;
    const results = await conn.query(query, [(page - 1) * rows, rows]);

    console.log('TopRated Sorting DB Results:', results);

    if (results.length === 0) {
        return [];
    }

    const performanceNames = results.map(row => row.prfnm);
    console.log('Performance Names:', performanceNames);

    let performances = await fetchPerformanceDetails(serviceKey, performanceNames);
    console.log('performances: ', performances);

    // 공연 이름과 평균 평점 매핑
    const ratingMap = {};
    results.forEach(row => {
        ratingMap[row.prfnm] = parseFloat(row.avgRating).toFixed(1); // 소수점 이하 첫째 자리까지
    });
    console.log('ratingMap: ', ratingMap);

    // JSON 포맷 설정
    return performances.map(performance => ({
        poster: performance.poster,
        prfnm: performance.prfnm,
        rating: ratingMap[performance.prfnm] || 0.0
    }));
};

// 메인화면 공연 목록 리스팅
const listPerformances = async (req, res) => {
    const serviceKey = process.env.SERVICE_KEY;
    const page = parseInt(req.query.page) || 1;
    const rows = parseInt(req.query.rows) || 8;
    const sortBy = req.query.sortBy || 'default';

    try {
        let performances;

        if (sortBy === 'latest') {
            performances = await latestSorting(serviceKey, page, rows);
        } else if (sortBy === 'popular') {
            performances = await popularSorting(serviceKey, page, rows);
        } else if (sortBy === 'topRated') {
            performances = await topRatedSorting(serviceKey, page, rows);
        } else {
            const apiUrl = `http://www.kopis.or.kr/openApi/restful/pblprfr?service=${serviceKey}&cpage=${page}&rows=${rows}&prfstate=02&newsql=Y`;
            const response = await axios.get(apiUrl);
            const xmlData = response.data;
            const jsonData = await xml2js.parseStringPromise(xmlData, { explicitArray: false });
            performances = jsonData.dbs.db || [];

            // 공연 이름 추출 후 배열 생성
            const performanceNames = performances.map(performance => performance.prfnm);
            console.log('performanceNames:', performanceNames);

            // 공연 평점 조회
            const query = 'SELECT prfnm, AVG(rating) as avgRating FROM review WHERE prfnm IN (?) GROUP BY prfnm';
            const result = await conn.query(query, [performanceNames]);
            const dbRows = Array.isArray(result) ? result : [result];
            console.log('dbRows:', dbRows);

            // 공연 이름과 평균 평점 매핑
            const ratingMap = {};
            dbRows.forEach(row => {
                ratingMap[row.prfnm] = parseFloat(row.avgRating).toFixed(1); // 소수점 이하 첫째 자리까지
            });
            console.log('ratingMap: ', ratingMap);

            // 공연 목록에 평점 추가
            performances = performances.map(performance => ({
                poster: performance.poster,
                prfnm: performance.prfnm,
                rating: ratingMap[performance.prfnm] || 0.0,
                stdate: performance.prfpdfrom
            }));
        }

        if (!performances || !Array.isArray(performances)) {
            throw new Error('공연 목록을 불러오는 중 오류가 발생했습니다.');
        }

        return res.status(StatusCodes.OK).json(performances);

    } catch (err) {
        console.error(err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '공연 목록을 불러오는 중 오류가 발생했습니다.' });
    }
};

module.exports = {
    listPerformances
};
