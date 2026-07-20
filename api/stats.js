// Manuscript Mentors — GET /api/stats -> { totalCritiques }
import { getCounter } from '../lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }
  const totalCritiques = await getCounter();
  res.status(200).json({ totalCritiques });
}
