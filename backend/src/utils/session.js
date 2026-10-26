const crypto = require('crypto');

const SESSION_DURATION_DAYS = 7;

const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const hashSessionToken = (token) => {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
};

const getSessionExpiry = () => {
  const expiry = new Date();

  expiry.setDate(
    expiry.getDate() + SESSION_DURATION_DAYS
  );

  return expiry;
};

module.exports = {
  generateSessionToken,
  hashSessionToken,
  getSessionExpiry,
};