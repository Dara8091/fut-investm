const { Router } = require('express');
const crypto = require('crypto');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { rls } = require('../middleware/rls');
const { referralLimiter, perRouteUserLimiter } = require('../middleware/rateLimit');

const router = Router();

const REFERRAL_BONUS_RATE = parseFloat(process.env.REFERRAL_BONUS_RATE || 0.05);

router.get('/code', authenticate, rls, perRouteUserLimiter, referralLimiter, (req, res) => {
    let user = db.prepare('SELECT id, referral_code FROM users WHERE id = ?').get(req.user.userId);
    if (!user.referral_code) {
        const code = `FUT${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, req.user.userId);
        user = { ...user, referral_code: code };
    }
    res.json({ referralCode: user.referral_code, bonusRate: REFERRAL_BONUS_RATE });
});

router.get('/stats', authenticate, rls, perRouteUserLimiter, referralLimiter, (req, res) => {
    const referralCount = db.prepare(
        'SELECT COUNT(*) as c FROM users WHERE referred_by = ?'
    ).get(req.user.userId).c;

    const referralEarnings = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as c FROM transactions WHERE user_id = ? AND type = 'referral_bonus' AND status = 'completed'"
    ).get(req.user.userId).c;

    const referrals = db.prepare(
        'SELECT id, email, full_name, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC LIMIT 20'
    ).all(req.user.userId);

    res.json({ referralCount, referralEarnings, referrals, bonusRate: REFERRAL_BONUS_RATE });
});

// Called when a referred user makes their first deposit
router.post('/track-deposit', authenticate, rls, perRouteUserLimiter, referralLimiter, (req, res) => {
    const user = db.prepare('SELECT id, referred_by FROM users WHERE id = ?').get(req.user.userId);
    if (!user.referred_by) return res.json({ bonus: 0 });

    const existing = db.prepare(
        "SELECT id FROM transactions WHERE user_id = ? AND type = 'referral_bonus' AND status = 'completed'"
    ).get(user.id);

    if (existing || !req.body.amount) return res.json({ bonus: 0 });

    const bonus = parseFloat(req.body.amount) * REFERRAL_BONUS_RATE;
    if (bonus <= 0) return res.json({ bonus: 0 });

    db.transaction(() => {
        db.prepare(
            `INSERT INTO transactions (user_id, type, asset, amount, status, metadata)
             VALUES (?, 'referral_bonus', 'USDT', ?, 'completed', ?)`
        ).run(user.referred_by, bonus, JSON.stringify({ referredUserId: user.id, originalAmount: req.body.amount }));

        db.prepare(
            'UPDATE accounts SET balance = balance + ?, accumulated_earnings = accumulated_earnings + ? WHERE user_id = ?'
        ).run(bonus, bonus, user.referred_by);
    })();

    res.json({ bonus });
});

module.exports = router;
