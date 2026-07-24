const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

const PARTICIPANTS_FILE = path.join(__dirname, 'participants.json');

function readParticipants() {
    try {
        if (fs.existsSync(PARTICIPANTS_FILE)) {
            return JSON.parse(fs.readFileSync(PARTICIPANTS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error reading participants file:', e.message);
    }
    return [];
}

function writeParticipants(data) {
    fs.writeFileSync(PARTICIPANTS_FILE, JSON.stringify(data, null, 2));
}

app.use(express.json());

// Serve static files from the 'public' directory with proper MIME types
app.use(express.static('public', {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Compute next available PID and redirect (does NOT register yet —
// participants are only saved when they click "Start Calibration")
app.get('/join', (req, res) => {
    const participants = readParticipants();
    const pid = participants.length > 0 ? Math.max(...participants.map(p => p.pid)) + 1 : 1;
    console.log(`Candidate PID issued (not yet registered): pid=${pid}`);
    res.redirect(`/?pid=${pid}`);
});

// Register participant when they actually start the experiment
app.post('/api/start', (req, res) => {
    const { pid } = req.body;
    if (!pid) return res.status(400).json({ error: 'pid required' });

    const participants = readParticipants();
    const pidInt = parseInt(pid);
    let participant = participants.find(p => p.pid === pidInt);

    if (!participant) {
        participants.push({
            pid: pidInt,
            status: 'started',
            startedAt: new Date().toISOString(),
            completedAt: null
        });
        writeParticipants(participants);
        console.log(`Participant ${pidInt} registered (started calibration)`);
    } else {
        console.log(`Participant ${pidInt} already registered`);
    }
    res.json({ ok: true });
});

// Mark participant as completed
app.post('/api/complete', (req, res) => {
    const { pid } = req.body;
    if (!pid) return res.status(400).json({ error: 'pid required' });

    const participants = readParticipants();
    const participant = participants.find(p => p.pid === parseInt(pid));
    if (participant) {
        participant.status = 'completed';
        participant.completedAt = new Date().toISOString();
        writeParticipants(participants);
    }
    res.json({ ok: true });
});

// Dashboard to view participant status
app.get('/dashboard', (req, res) => {
    const participants = readParticipants();
    const total = participants.length;
    const completed = participants.filter(p => p.status === 'completed').length;
    const inProgress = participants.filter(p => p.status === 'started').length;

    const rows = participants.map(p => {
        const statusColor = p.status === 'completed' ? '#4ade80' : '#fbbf24';
        const started = p.startedAt ? new Date(p.startedAt).toLocaleString() : '—';
        const finished = p.completedAt ? new Date(p.completedAt).toLocaleString() : '—';
        return `<tr>
            <td style="padding:8px 16px;">P${String(p.pid).padStart(2,'0')}</td>
            <td style="padding:8px 16px;color:${statusColor};font-weight:bold;">${p.status}</td>
            <td style="padding:8px 16px;color:#aaa;">${started}</td>
            <td style="padding:8px 16px;color:#aaa;">${finished}</td>
            <td style="padding:8px 16px;color:#888;">${p.recycled ? 'Yes' : ''}</td>
        </tr>`;
    }).join('');

    res.send(`<!DOCTYPE html><html><head><title>Participant Dashboard</title>
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
    <table><thead><tr><th>PID</th><th>Status</th><th>Started</th><th>Completed</th><th>Recycled</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" style="padding:20px;color:#666;">No participants yet. Share the /join link to get started.</td></tr>'}</tbody></table>
    <a class="link" href="/join" target="_blank">Test /join link (assigns next PID)</a>
    </body></html>`);
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'voronoi.html'));
});

// Handle any other routes by serving index.html (for SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'voronoi.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`  Join link:  http://localhost:${PORT}/join`);
    console.log(`  Dashboard:  http://localhost:${PORT}/dashboard`);
});