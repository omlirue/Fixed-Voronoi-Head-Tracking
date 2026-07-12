// POST /api/start
// Registers a participant when they actually start the parameter optimization.
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
    const existing = participants.find(p => p.pid === pidInt);

    if (!existing) {
      participants.push({
        pid: pidInt,
        status: 'started',
        startedAt: new Date().toISOString(),
        completedAt: null,
      });
      await writeParticipants(participants);
      console.log(`Participant ${pidInt} registered (started parameter optimization)`);
    } else {
      console.log(`Participant ${pidInt} already registered`);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Error in /api/start:', err);
    res.status(500).json({ error: 'Failed to register participant', details: err.message });
  }
};
