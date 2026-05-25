const db = require('../config/database');

async function getNetwork(req, res) {
    try {
        const userId = req.user.userId;

        const nodes = await db.prepare('SELECT * FROM network_nodes WHERE user_id = $1 ORDER BY id ASC').all(userId);

        if (nodes.length === 0) {
            return res.json({
                root: null,
                stats: { leftPoints: 0, rightPoints: 0, totalVolume: 0 }
            });
        }

        const root = nodes[0];
        const totalVolume = nodes.reduce((sum, n) => sum + n.volume, 0);

        res.json({
            nodes: nodes.map(n => ({
                id: n.id,
                parentId: n.parent_id,
                side: n.side,
                name: n.name,
                role: n.role,
                pointsLeft: n.points_left,
                pointsRight: n.points_right,
                volume: n.volume
            })),
            stats: {
                leftPoints: root.points_left,
                rightPoints: root.points_right,
                totalVolume
            }
        });
    } catch (err) {
        require('../config/logger').error('Error en getNetwork:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
}

module.exports = { getNetwork };
