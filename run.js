const { spawn } = require('child_process');
const path = require('path');

function runCommand(command, args, cwd, name) {
    const process = spawn(command, args, {
        cwd,
        shell: true,
        stdio: 'inherit'
    });

    console.log(`[${name}] Started process...`);

    process.on('error', (err) => {
        console.error(`[${name}] Error:`, err);
    });

    process.on('close', (code) => {
        console.log(`[${name}] Process exited with code ${code}`);
    });

    return process;
}

const backendDir = path.join(__dirname, 'backend');
const frontendDir = path.join(__dirname, 'frontend');

console.log('Starting Backend and Frontend...');

const backend = runCommand('node', ['index.js'], backendDir, 'Backend');
const frontend = runCommand('npm', ['run', 'dev'], frontendDir, 'Frontend');

process.on('SIGINT', () => {
    console.log('\nStopping everything...');
    backend.kill();
    frontend.kill();
    process.exit();
});
