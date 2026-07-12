// GET /dashboard (rewritten from /api/dashboard via vercel.json)
// HTML dashboard listing all participants and their status.
const { readParticipants } = require('./_redis');

module.exports = async (req, res) => {
  try {
    const participants = await readParticipants();
    const total = participants.length;
    const completed = participants.filter(p => p.status === 'completed').length;
    const inProgress = participants.filter(p => p.status === 'started').length;

    const rows = participants
      .sort((a, b) => a.pid - b.pid)
      .map(p => {
        const statusColor = p.status === 'completed' ? '#4ade80' : '#fbbf24';
        const started = p.startedAt ? new Date(p.startedAt).toLocaleString() : '\u2014';
        const finished = p.completedAt ? new Date(p.completedAt).toLocaleString() : '\u2014';
        return `<tr>
          <td style="padding:8px 16px;">P${String(p.pid).padStart(2, '0')}</td>
          <td style="padding:8px 16px;color:${statusColor};font-weight:bold;">${p.status}</td>
          <td style="padding:8px 16px;color:#aaa;">${started}</td>
          <td style="padding:8px 16px;color:#aaa;">${finished}</td>
        </tr>`;
      })
      .join('');

    const html = `<!DOCTYPE html><html><head><title>Participant Dashboard</title>
    <meta http-equiv="refresh" content="30">
    <style>
      body{background:#111;color:#eee;font-family:system-ui,sans-serif;padding:40px;margin:0;}
      h1{margin-bottom:8px;} .stats{color:#aaa;margin-bottom:24px;font-size:15px;}
      table{border-collapse:collapse;width:100%;max-width:800px;}
      th{text-align:left;padding:8px 16px;border-bottom:2px solid #333;color:#888;font-size:13px;}
      tr:nth-child(even){background:#1a1a1a;} td{border-bottom:1px solid #222;}
      .link{color:#60a5fa;font-size:13px;margin-top:24px;display:block;}
    </style></head><body>
    <h1>Participant Dashboard</h1>
    <div class="stats">${completed} completed / ${inProgress} in progress / ${total} total &nbsp; (auto-refreshes every 30s)</div>
    <table>
      <thead><tr><th>PID</th><th>Status</th><th>Started</th><th>Completed</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="padding:20px;color:#666;">No participants yet. Share the /join link to get started.</td></tr>'}</tbody>
    </table>
    <a class="link" href="/join" target="_blank">Test /join link (assigns next PID)</a>
    </body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    console.error('Error in /dashboard:', err);
    res.status(500).send(`<pre style="color:red;font-family:monospace;padding:40px;">
Error loading dashboard: ${err.message}

Check that the Upstash Redis env vars (KV_REST_API_URL, KV_REST_API_TOKEN)
are set in your Vercel project settings.
</pre>`);
  }
};
