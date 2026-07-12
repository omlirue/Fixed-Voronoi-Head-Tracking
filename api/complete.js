// POST /api/complete
// Marks a participant as completed (called when they finish the Fitts experiment).
const { readParticipants, writeParticipants } = require('./_redis');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { pid } = body;
    if (!pid) return res.status(400).json({ error: 'pid required' });

    const pidInt = parseInt(pid);
    const participants = await readParticipants();
    const participant = participants.find(p => p.pid === pidInt);

    if (participant) {
      participant.status = 'completed';
      participant.completedAt = new Date().toISOString();
      await writeParticipants(participants);
      console.log(`Participant ${pidInt} marked as completed`);
    } else {
      console.log(`Participant ${pidInt} not found when marking complete`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/complete:', err);
    res.status(500).json({ error: 'Failed to mark complete', details: err.message });
  }
};
