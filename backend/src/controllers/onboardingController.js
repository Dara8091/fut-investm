const db = require('../config/database');

const STEPS = ['step_welcome', 'step_profile', 'step_deposit', 'step_kyc', 'step_contract'];

async function getProgress(req, res) {
    try {
        const userId = req.user.userId;
        let progress = await db.prepare('SELECT * FROM onboarding_progress WHERE user_id = $1').get(userId);

        if (!progress) {
            await db.prepare('INSERT INTO onboarding_progress (user_id) VALUES ($1)').run(userId);
            progress = { step_welcome: false, step_profile: false, step_deposit: false, step_kyc: false, step_contract: false, completed: false };
        }

        const completedSteps = STEPS.filter(s => progress[s]).length;
        const totalSteps = STEPS.length;

        res.json({
            progress: {
                welcome: !!progress.step_welcome,
                profile: !!progress.step_profile,
                deposit: !!progress.step_deposit,
                kyc: !!progress.step_kyc,
                contract: !!progress.step_contract,
            },
            completed: !!progress.completed,
            completedSteps,
            totalSteps,
            percentage: Math.round((completedSteps / totalSteps) * 100),
        });
    } catch (err) {
        require('../config/logger').error('Error en getProgress:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

async function completeStep(req, res) {
    try {
        const { step } = req.body;
        if (!STEPS.includes(step)) {
            return res.status(400).json({ error: 'Paso inválido' });
        }

        await db.prepare(
            `UPDATE onboarding_progress SET ${step} = TRUE, updated_at = NOW() WHERE user_id = $1`
        ).run(req.user.userId);

        const progress = await db.prepare('SELECT * FROM onboarding_progress WHERE user_id = $1').get(req.user.userId);
        const allDone = STEPS.every(s => progress[s]);
        if (allDone && !progress.completed) {
            await db.prepare(
                "UPDATE onboarding_progress SET completed = TRUE, completed_at = NOW(), updated_at = NOW() WHERE user_id = $1"
            ).run(req.user.userId);
        }

        res.json({ success: true, completed: allDone });
    } catch (err) {
        require('../config/logger').error('Error en completeStep:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { getProgress, completeStep };
