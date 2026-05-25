#!/usr/bin/env node
/**
 * Pre-deployment Checklist
 * Run: node scripts/pre-deploy-checklist.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n🚀 fut.invest — Pre-Deployment Checklist');
console.log('='.repeat(50));

const checks = [];

// Environment checks
function checkEnv() {
    console.log('\n📋 Environment Variables:');
    
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) {
        console.log('  ❌ .env file not found');
        checks.push(false);
        return;
    }
    
    const env = fs.readFileSync(envPath, 'utf8');
    const required = ['JWT_SECRET', 'TOTP_SECRET', 'APP_SECRET', 'FRONTEND_URL'];
    
    required.forEach(key => {
        if (env.includes(`${key}=`) && !env.includes(`${key}=change_me`)) {
            console.log(`  ✅ ${key} configured`);
            checks.push(true);
        } else {
            console.log(`  ❌ ${key} not configured or using default`);
            checks.push(false);
        }
    });
    
    // Check for production secrets
    if (env.includes('change_me_in_production') || env.includes('dev-secret')) {
        console.log('  ⚠️  Using development secrets — generate production secrets!');
        checks.push(false);
    } else {
        console.log('  ✅ Production secrets configured');
        checks.push(true);
    }
}

// Database checks
function checkDatabase() {
    console.log('\n🗄️  Database:');
    
    const envPath = path.join(__dirname, '../.env');
    const env = fs.readFileSync(envPath, 'utf8');
    
    if (env.includes('DB_TYPE=postgres')) {
        console.log('  ✅ PostgreSQL configured');
        checks.push(true);
    } else if (env.includes('DB_TYPE=sqlite')) {
        console.log('  ⚠️  SQLite configured — use PostgreSQL for production');
        checks.push(false);
    } else {
        console.log('  ⚠️  DB_TYPE not specified');
        checks.push(false);
    }
}

// Security checks
function checkSecurity() {
    console.log('\n🔒 Security:');
    
    const envPath = path.join(__dirname, '../.env');
    const env = fs.readFileSync(envPath, 'utf8');
    
    const securityVars = {
        'WAF_ENABLED': 'true',
        'CSRF_ENABLED': 'true',
        'NODE_ENV': 'production',
    };
    
    Object.entries(securityVars).forEach(([key, expected]) => {
        if (env.includes(`${key}=${expected}`)) {
            console.log(`  ✅ ${key}=${expected}`);
            checks.push(true);
        } else {
            console.log(`  ⚠️  ${key} should be ${expected}`);
            checks.push(false);
        }
    });
}

// File checks
function checkFiles() {
    console.log('\n📁 Required Files:');
    
    const files = [
        { path: '../index.html', name: 'Frontend HTML' },
        { path: '../style.css', name: 'Frontend CSS' },
        { path: '../app.js', name: 'Frontend JS' },
        { path: '../README.md', name: 'README' },
        { path: '../DEPLOY.md', name: 'Deployment Guide' },
        { path: '../CHANGELOG.md', name: 'Changelog' },
        { path: '../.gitignore', name: '.gitignore' },
        { path: './backup.js', name: 'Backup Script' },
        { path: './generate-secrets.js', name: 'Secrets Generator' },
    ];
    
    files.forEach(file => {
        const fullPath = path.join(__dirname, file.path);
        if (fs.existsSync(fullPath)) {
            console.log(`  ✅ ${file.name}`);
            checks.push(true);
        } else {
            console.log(`  ❌ ${file.name} missing`);
            checks.push(false);
        }
    });
}

// Git checks
function checkGit() {
    console.log('\n📦 Git:');
    
    const gitignorePath = path.join(__dirname, '../.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignore = fs.readFileSync(gitignorePath, 'utf8');
        
        if (gitignore.includes('.env')) {
            console.log('  ✅ .env in .gitignore');
            checks.push(true);
        } else {
            console.log('  ❌ .env not in .gitignore');
            checks.push(false);
        }
        
        if (gitignore.includes('node_modules')) {
            console.log('  ✅ node_modules in .gitignore');
            checks.push(true);
        } else {
            console.log('  ❌ node_modules not in .gitignore');
            checks.push(false);
        }
    }
}

// Run all checks
checkEnv();
checkDatabase();
checkSecurity();
checkFiles();
checkGit();

// Summary
console.log('\n' + '='.repeat(50));
const passed = checks.filter(Boolean).length;
const total = checks.length;
const percentage = Math.round((passed / total) * 100);

console.log(`\n📊 Results: ${passed}/${total} checks passed (${percentage}%)`);

if (percentage === 100) {
    console.log('\n✅ Ready for deployment!');
} else if (percentage >= 80) {
    console.log('\n⚠️  Almost ready — fix warnings before deploying');
} else {
    console.log('\n❌ Not ready for deployment — fix critical issues first');
}

console.log('\n');
