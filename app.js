const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const RESULT_STATS_FILE = path.join(__dirname, 'data', 'result-stats.ndjson');
let writeQueue = Promise.resolve();

app.use(express.json({limit: '256kb'}));

function isValidQuestionDurations(questionDurations) {
    if (!Array.isArray(questionDurations)) return false;

    return questionDurations.every(entry => {
        if (!Array.isArray(entry) || entry.length !== 3) return false;
        const [questionId, durationMs, answerValue] = entry;
        if (typeof questionId !== 'string' || !questionId) return false;
        if (!Number.isFinite(durationMs) || durationMs < 0) return false;
        if (answerValue !== null && !Number.isFinite(answerValue)) return false;
        return true;
    });
}

function appendResultRecord(record) {
    const line = `${JSON.stringify(record)}\n`;
    writeQueue = writeQueue
        .then(() => fs.appendFile(RESULT_STATS_FILE, line, 'utf8'))
        .catch(error => {
            console.error('Failed to append result stats:', error);
            throw error;
        });
    return writeQueue;
}

app.post('/api/result-stats', async (req, res) => {
    const {
        totalDurationMs,
        finalResultTimeUtc8,
        finalTypeCode,
        finalPattern,
        questionDurations
    } = req.body || {};

    if (
        !Number.isFinite(totalDurationMs)
        || totalDurationMs < 0
        || typeof finalResultTimeUtc8 !== 'string'
        || typeof finalTypeCode !== 'string'
        || typeof finalPattern !== 'string'
        || !isValidQuestionDurations(questionDurations)
    ) {
        return res.status(400).json({ok: false, error: 'invalid_payload'});
    }

    const userAgent = req.get('user-agent');
    const record = {
        totalDurationMs,
        finalResultTimeUtc8,
        finalTypeCode,
        finalPattern,
        questionDurations,
        ...(userAgent ? {userAgent} : {}),
        createdAt: new Date().toISOString()
    };

    try {
        await fs.mkdir(path.dirname(RESULT_STATS_FILE), {recursive: true});
        await appendResultRecord(record);
        return res.status(201).json({ok: true});
    } catch (error) {
        console.error('Failed to save result stats:', error);
        return res.status(500).json({ok: false, error: 'save_failed'});
    }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;
