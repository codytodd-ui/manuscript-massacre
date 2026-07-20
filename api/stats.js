// Manuscript Mentors — GET /api/stats -> { totalCritiques }
import { readStats } from '../lib/stats.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }
  res.status(200).json(readStats());
}
