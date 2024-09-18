const { StatusCodes } = require('http-status-codes'); // status code 모듈
const jwt = require('jsonwebtoken'); // jwt 모듈
const crypto = require('crypto'); // 암호화 모듈
const conn = require('./mariadb');
const dotenv = require('dotenv');
dotenv.config();

// 토큰 생성 함수
const generateToken = (user, secretKey, expiresIn) => {
  return jwt.sign({
    id: user.user_id,
    email: user.email
  }, secretKey, {
    expiresIn,
    issuer: 'remu'
  });
};

const join = async (req, res) => {

  const { nickname, email, password } = req.body;

  // 필드가 비어있는지 확인
  if (!nickname || !email || !password) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: '입력 필드는 비워둘 수 없습니다.' });
  }

  try{
    // 닉네임 중복 확인
    const [nicknameCheck] = await conn.query("SELECT EXISTS (SELECT * FROM user WHERE nickname=?) AS 'exist'", nickname);
    if(nicknameCheck.exist){
      return res.status(StatusCodes.CONFLICT).json({ message: '이미 사용중인 닉네임 입니다.' });
    }

    // 이메일 중복 확인
    const [emailCheck] = await conn.query("SELECT EXISTS (SELECT * FROM user WHERE email=?) AS 'exist'", email)
    if(emailCheck.exist){
      return res.status(StatusCodes.CONFLICT).json({ message: '이미 사용중인 이메일 입니다.' });
    }

    let sql = 'INSERT INTO user (nickname, email, password, salt) VALUES (?, ?, ?, ?)';

    // 암호화 된 비밀번호와 salt 값을 같이 DB에 저장
    const salt = crypto.randomBytes(10).toString('base64');
    const hashPassword = crypto.pbkdf2Sync(password, salt, 10000, 10, 'sha512').toString('base64');
  
    // 로그인 시, 이메일 & 비밀번호(암호화X) => salt 값 꺼내서 비밀번호 암호화 하고 => DB 비밀번호랑 비교
    let values = [nickname, email, hashPassword, salt];
    conn.query(sql, values);
    return res.status(StatusCodes.CREATED).json({ message: '회원가입을 완료하였습니다.' });
  } catch(err){
    console.log(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).end();
  }
};

const login = async (req, res) => {
  const {email, password} = req.body;

    // 필드가 비어있는지 확인
    if (!email || !password) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: '입력 필드는 비워둘 수 없습니다.' });
    }

    try{
      // 이메일 존재 여부 확인
      const [emailCheck] = await conn.query("SELECT EXISTS (SELECT * FROM user WHERE email=?) AS 'exist'", email)
      if(!emailCheck.exist){
        return res.status(StatusCodes.UNAUTHORIZED).json({ message: '없는 이메일 입니다.' });
      }
    
      const [user] = await conn.query('SELECT * FROM user WHERE email = ?', [email]);
      const loginUser = user;

      // 사용자가 존재하지 않는 경우
      if (!loginUser) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ message: '로그인에 실패하였습니다.' });
      }

      // 비밀번호 일치하지 않는 경우
      const hashPassword = crypto.pbkdf2Sync(password, loginUser.salt, 10000, 10, 'sha512').toString('base64');
      if (loginUser.password !== hashPassword) {
        return res.status(StatusCodes.UNAUTHORIZED).json({ message: '비밀번호가 틀렸습니다.' });
      }

      // 1m으로 변경 후 테스트 완료
      const accessToken = generateToken(loginUser, process.env.PRIVATE_KEY, '1h');
      const refreshToken = generateToken(loginUser, process.env.PRIVATE_KEY, '7d');

      // Refresh Token을 데이터베이스에 저장
      await conn.query('UPDATE user SET refresh_token = ? WHERE email = ?', [refreshToken, email]);

      // maxAge or expires 설정X: 세션쿠키(브라우저 닫을 때 삭제됨), 밀리초 단위
      // httpOnly: XSS 방지 / secure: 쿠키 https로만 전송, 네트워크 도청 방지 / sameSite: CSRF 방지(None, Strict, Lax) -> 종합적으로 쿠키 탈취 방지
      const now = new Date();
      res.cookie('accessToken', accessToken, { httpOnly : true, secure: process.env.NODE_ENV === 'production', expires: new Date(now.getTime() + 1 * 60 * 60 * 1000), sameSite: 'Lax'}); // 쿠키 1시간 동안 유효
      res.cookie('refreshToken', refreshToken, { httpOnly : true, secure: process.env.NODE_ENV === 'production', expires: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), sameSite: 'Lax'}); // 쿠키 7일 동안 유효

      return res.status(StatusCodes.OK).json({ message: '로그인에 성공하였습니다', accessToken: accessToken });
    } catch(err){
      console.error(err);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '로그인 중 오류가 발생하였습니다.' });
    }
};

const logout = async(req, res) => {
  const accessToken = req.cookies.accessToken;

  try {
    const decoded = jwt.verify(accessToken, process.env.PRIVATE_KEY);
    const email = decoded.email;

    // Refresh Token을 데이터베이스에서 삭제
    await conn.query('UPDATE user SET refresh_token = NULL WHERE email = ?', [email]);

    // 쿠키 삭제
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return res.status(StatusCodes.OK).json({ message: '로그아웃에 성공하였습니다.' });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '로그아웃 중 오류가 발생하였습니다.' });
  }
};

const password = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: '입력 필드는 비워둘 수 없습니다.' });
  }

  if (newPassword == currentPassword) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: '기존과 다른 비밀번호를 설정해야 합니다.' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: '비밀번호가 일치하지 않습니다.' });
  }

  const accessToken = req.cookies.accessToken;

  try {
    const decoded = jwt.verify(accessToken, process.env.PRIVATE_KEY);
    const email = decoded.email;

    const [user] = await conn.query('SELECT * FROM user WHERE email = ?', [email]);

    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: '사용자를 찾을 수 없습니다.' });
    }

    const hashCurrentPassword = crypto.pbkdf2Sync(currentPassword, user.salt, 10000, 10, 'sha512').toString('base64');
    if (user.password !== hashCurrentPassword) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: '현재 비밀번호가 일치하지 않습니다.' });
    }

    const salt = crypto.randomBytes(10).toString('base64');
    const hashNewPassword = crypto.pbkdf2Sync(newPassword, salt, 10000, 10, 'sha512').toString('base64');

    await conn.query('UPDATE user SET password = ?, salt = ? WHERE email = ?', [hashNewPassword, salt, email]);

    return res.status(StatusCodes.OK).json({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '비밀번호 변경 중 오류가 발생하였습니다.' });
  }
};

const account = async(req, res) => {
  const accessToken = req.cookies.accessToken;
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Refresh Token이 없습니다.' });
}
  try {
    const decoded = jwt.verify(accessToken, process.env.PRIVATE_KEY);
    const email = decoded.email;

    // Refresh Token을 데이터베이스에서 삭제
    await conn.query('UPDATE user SET refresh_token = NULL WHERE email = ?', [email]);

    // 사용자 계정 삭제
    await conn.query('DELETE FROM user WHERE email = ?', [email]);

    // 쿠키 삭제
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    return res.status(StatusCodes.OK).json({ message: '회원 탈퇴 완료하였습니다.' });
  } catch (err) {
    console.error(err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: '회원 탈퇴 중 오류가 발생하였습니다.' });
  }
};

module.exports = {
  join,
  login,
  logout,
  password,
  account
};