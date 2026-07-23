const { spawn } = require('child_process');
const https = require('https');
const os = require('os');

const MAX_RETRIES = 3;
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1448481765932007628/CTNjFtMQahO7WMqcovPPky3cgbdbHBGAi3oXYEidmPrnpInGoDQnDfFBXZsB48vvUlxE';
const CRASH_MESSAGE = '[nodemon] app crashed - waiting for file changes before starting...';

let retryCount = 0;
let childProcess = null;
let logBuffer = '';
let isRecovering = false;

function startApp() {
    isRecovering = false;
    console.log(`\n[Monitor] Starting application... (Attempt ${retryCount + 1})`);
    
    // Reset log buffer for the new run
    logBuffer = '';

    const npmCmd = os.platform() === 'win32' ? 'npm.cmd' : 'npm';
    
    // Spawn the process
    childProcess = spawn(npmCmd, ['run', 'start'], {
        stdio: ['inherit', 'pipe', 'pipe'], // Pipe stdout/stderr so we can read it
        shell: true
    });

    childProcess.stdout.on('data', (data) => {
        const str = data.toString();
        process.stdout.write(str); // Pass through to console
        handleOutput(str);
    });

    childProcess.stderr.on('data', (data) => {
        const str = data.toString();
        process.stderr.write(str); // Pass through to console
        handleOutput(str);
    });

    childProcess.on('close', (code) => {
        // If the process exits on its own (not killed by us for restart), we might want to log it.
        if (!isRecovering) {
             console.log(`[Monitor] Process exited with code ${code}`);
        }
    });
}

function handleOutput(chunk) {
    if (isRecovering) return;

    logBuffer += chunk;
    
    // Keep buffer size reasonable to prevent memory issues
    if (logBuffer.length > 500000) {
        logBuffer = logBuffer.slice(-500000);
    }

    if (logBuffer.includes(CRASH_MESSAGE)) {
        isRecovering = true;
        console.log('\n[Monitor] Crash detected!');
        
        // Kill the current process tree
        if (childProcess) {
            killProcessTree(childProcess.pid);
        }

        if (retryCount < MAX_RETRIES) {
            retryCount++;
            console.log(`[Monitor] Restarting in 3 seconds... (${retryCount}/${MAX_RETRIES})`);
            setTimeout(startApp, 3000);
        } else {
            console.log('[Monitor] Max retries reached. Sending notification to Discord...');
            sendDiscordNotification();
        }
    }
}

function killProcessTree(pid) {
    if (os.platform() === 'win32') {
        try {
            spawn('taskkill', ['/pid', pid, '/f', '/t']);
        } catch (e) {
            console.error('[Monitor] Failed to kill process:', e);
        }
    } else {
        try {
            process.kill(pid, 'SIGKILL'); 
        } catch (e) {
             // ignore if already dead
        }
    }
}

function sendDiscordNotification() {
    // Extract error message
    // Find the last occurrence of "Error:" before the crash message
    const crashIndex = logBuffer.lastIndexOf(CRASH_MESSAGE);
    const errorIndex = logBuffer.lastIndexOf('Error:', crashIndex);
    
    let errorText = 'No specific "Error:" keyword found in logs.';
    if (errorIndex !== -1) {
        // Extract from "Error:" to the crash message
        errorText = logBuffer.substring(errorIndex, crashIndex).trim();
    } else {
        // Fallback: take last 20 lines before crash
        const lines = logBuffer.substring(0, crashIndex).split('\n');
        errorText = lines.slice(-20).join('\n');
    }

    // Truncate if too long for Discord (limit is 2000 chars usually, but inside code block slightly less)
    if (errorText.length > 1800) {
        errorText = errorText.substring(0, 1800) + '... (truncated)';
    }

    const payload = JSON.stringify({
        content: `🚨 **Application Crashed** 🚨\nAfter ${MAX_RETRIES} restart attempts, the app is still crashing.\n\n**Error Log:**\n\`\`\`\n${errorText}\n\`\`\``
    });

    const url = new URL(WEBHOOK_URL);
    const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const req = https.request(options, (res) => {
        console.log(`[Monitor] Discord notification sent. Status: ${res.statusCode}`);
        process.exit(1);
    });

    req.on('error', (e) => {
        console.error(`[Monitor] Failed to send Discord notification: ${e.message}`);
        process.exit(1);
    });

    req.write(payload);
    req.end();
}

startApp();
