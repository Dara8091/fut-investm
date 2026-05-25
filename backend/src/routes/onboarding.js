const { Router } = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { onboardingLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

router.get('/progress', authenticate, rls, perRouteUserLimiter, onboardingLimiter, (req, res) => {
    const progress = db.prepare('SELECT * FROM onboarding_progress WHERE user_id = ?').get(req.user.userId);
    if (!progress) {
        db.prepare('INSERT INTO onboarding_progress (user_id) VALUES (?)').run(req.user.userId);
        return res.json({
            progress: { step_welcome: 0, step_profile: 0, step_deposit: 0, step_kyc: 0, step_contract: 0, completed: 0 }
        });
    }
    res.json({ progress });
});

router.post('/step', authenticate, rls, perRouteUserLimiter, onboardingLimiter, (req, res) => {
    const { step } = req.body;
    const validSteps = ['step_welcome', 'step_profile', 'step_deposit', 'step_kyc', 'step_contract'];
    if (!validSteps.includes(step)) {
        return res.status(400).json({ error: 'Paso inválido' });
    }

    db.prepare(
        `UPDATE onboarding_progress SET ${step} = 1, updated_at = datetime('now') WHERE user_id = ?`
    ).run(req.user.userId);

    // Check if all steps completed
    const progress = db.prepare('SELECT * FROM onboarding_progress WHERE user_id = ?').get(req.user.userId);
    if (progress && progress.step_welcome && progress.step_profile && progress.step_deposit &&
        progress.step_kyc && progress.step_contract && !progress.completed) {
        db.prepare(
            "UPDATE onboarding_progress SET completed = 1, completed_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?"
        ).run(req.user.userId);
    }

    res.json({ success: true });
});

module.exports = router;
