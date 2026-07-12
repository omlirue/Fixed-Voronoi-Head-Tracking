// GET /join (rewritten from /api/join via vercel.json)
// Computes the next available PID and redirects to /?pid=N.
// Does NOT register the participant — that only happens once they
// click "Start" on the parameter optimization screen (see /api/start).
const { readParticipants } = require('./_redis');

module.exports = async (req, res) => {
  try {
    const participants = await readParticipants();
    const pid = participants.length > 0
      ? Math.max(...participants.map(p => p.pid)) + 1
      : 1;
    console.log(`Candidate PID issued (not yet registered): pid=${pid}`);
    res.redirect(302, `/?pid=${pid}`);
  } catch (err) {
    console.error('Error in /join:', err);
    res.status(500).json({ error: 'Failed to assign PID', details: err.message });
  }
};
