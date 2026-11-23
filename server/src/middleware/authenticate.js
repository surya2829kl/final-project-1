import jwt from 'jsonwebtoken';

export default function authenticate(req, res, next) {
  const authorization = req.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Please log in to continue.' });
  }

  try {
    const payload = jwt.verify(authorization.slice(7), process.env.JWT_SECRET);
    if (!payload.sub) return res.status(401).json({ message: 'Your session is invalid. Please log in again.' });
    req.userId = payload.sub;
    return next();
  } catch {
    return res.status(401).json({ message: 'Your session has expired. Please log in again.' });
  }
}
