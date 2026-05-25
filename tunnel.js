const lt = require('localtunnel');

async function startTunnel() {
    try {
        console.log('🚀 Creating public tunnel...');
        
        const tunnel = await lt({ port: 8080 });
        
        tunnel.on('error', (err) => {
            console.error('❌ Tunnel error:', err.message);
        });
        
        tunnel.on('close', () => {
            console.log('\n⚠️  Tunnel closed');
            process.exit(0);
        });
        
        console.log('\n' + '='.repeat(50));
        console.log('🌐 PUBLIC URL:');
        console.log(tunnel.url);
        console.log('='.repeat(50));
        console.log('\n📋 Share this link with anyone!');
        console.log('⏳ Tunnel will stay open until you close this window\n');
        
    } catch (err) {
        console.error('❌ Failed to create tunnel:', err.message);
        process.exit(1);
    }
}

startTunnel();
