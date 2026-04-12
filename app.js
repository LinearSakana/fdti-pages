const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const RESULT_STATS_FILE = path.join(__dirname, 'data', 'result-stats.json');

app.use(express.json({limit: '256kb'}));

app.post('/api/result-stats', async (req, res) => {
    const {
        totalDurationMs,
        finalResultTimeUtc8,
        finalTypeCode,
        finalPattern,
        questionDurations
    } = req.body || {};

    if (
        typeof totalDurationMs !== 'number'
        || typeof finalResultTimeUtc8 !== 'string'
        || typeof finalTypeCode !== 'string'
        || typeof finalPattern !== 'string'
        || !Array.isArray(questionDurations)
    ) {
        return res.status(400).json({ok: false, error: 'invalid_payload'});
    }

    const record = {
        totalDurationMs,
        finalResultTimeUtc8,
        finalTypeCode,
        finalPattern,
        questionDurations,
        createdAt: new Date().toISOString()
    };

    try {
        await fs.mkdir(path.dirname(RESULT_STATS_FILE), {recursive: true});

        let data = [];
        try {
            const raw = await fs.readFile(RESULT_STATS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) data = parsed;
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        data.push(record);
        await fs.writeFile(RESULT_STATS_FILE, JSON.stringify(data, null, 2), 'utf8');
        return res.status(201).json({ok: true});
    } catch (error) {
        console.error('Failed to save result stats:', error);
        return res.status(500).json({ok: false, error: 'save_failed'});
    }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
