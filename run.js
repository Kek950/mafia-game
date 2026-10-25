const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

function getLocalIpAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push(net.address);
            }
        }
    }
    return addresses;
}

function runCommand(command, args, cwd, name) {
    const proc = spawn(command, args, {
        cwd,
        shell: true,
        stdio: 'inherit'
    });

    console.log(`[${name}] Started process...`);

    proc.on('error', (err) => {
        console.error(`[${name}] Error:`, err);
    });

    proc.on('close', (code) => {
        console.log(`[${name}] Process exited with code ${code}`);
    });

    return proc;
}

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

console.log('==================================================');
console.log('       🤠 STARTING MAFIA ONLINE GAME 🤠           ');
console.log('==================================================');

const localIps = getLocalIpAddresses();
console.log('Local PC URL:      http://localhost:5173');
if (localIps.length > 0) {
    console.log(`Wi-Fi / LAN URL:   http://${localIps[0]}:5173`);
    console.log('-> Share this Wi-Fi / LAN link with friends on your network to play together from their phones or laptops!');
}
console.log('Backend API:       Port 3001');
console.log('==================================================\n');

const backend = runCommand('node', ['index.js'], backendDir, 'Backend');
const frontend = runCommand('npm', ['run', 'dev'], frontendDir, 'Frontend');

function killProcessTree(proc) {
    if (!proc || !proc.pid) return;
    if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
            execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' });
        } catch (_) {}
    } else {
        proc.kill('SIGTERM');
    }
}

process.on('SIGINT', () => {
    console.log('\n[MAFIA] Disbanding posse and stopping all servers...');
    killProcessTree(backend);
    killProcessTree(frontend);
    process.exit(0);
});

process.on('SIGTERM', () => {
    killProcessTree(backend);
    killProcessTree(frontend);
    process.exit(0);
});
