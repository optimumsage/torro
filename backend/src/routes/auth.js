const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const validUser = username === process.env.APP_USERNAME;
  const validPass = validUser && await bcrypt.compare(password, process.env.APP_PASSWORD_HASH);
  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res
    .cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7 * 86400000 })
    .json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('token').json({ ok: true });
});

module.exports = router;
