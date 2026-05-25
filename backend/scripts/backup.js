#!/usr/bin/env node
/**
 * Database Backup Script
 * Ejecutar: node scripts/backup.js
 * Recomendado: Agregar a cron para backups automáticos
 * 
 * Cron example (daily at 2am):
 * 0 2 * * * cd /path/to/backend && node scripts/backup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_DIR = path.join(__dirname, '../../backups');
const DB_TYPE = process.env.DB_TYPE || 'sqlite';
const DATE = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

async function backupSQLite() {
    const dbPath = process.env.DB_PATH || './data/fut_invest.db';
    const backupFile = path.join(BACKUP_DIR, `sqlite-backup-${DATE}.db`);
    
    console.log(`📦 Creating SQLite backup: ${backupFile}`);
    
    // Copy database file
    fs.copyFileSync(dbPath, backupFile);
    
    // Compress
    const compressedFile = `${backupFile}.gz`;
    execSync(`gzip -c "${backupFile}" > "${compressedFile}"`);
    fs.unlinkSync(backupFile); // Remove uncompressed
    
    console.log(`✅ Backup created: ${compressedFile}`);
    return compressedFile;
}

async function backupPostgres() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        throw new Error('DATABASE_URL not configured');
    }
    
    const backupFile = path.join(BACKUP_DIR, `postgres-backup-${DATE}.sql.gz`);
    
    console.log(`📦 Creating PostgreSQL backup: ${backupFile}`);
    
    // Use pg_dump
    execSync(`pg_dump "${databaseUrl}" | gzip > "${backupFile}"`);
    
    console.log(`✅ Backup created: ${backupFile}`);
    return backupFile;
}

async function cleanupOldBackups(daysToKeep = 30) {
    const files = fs.readdirSync(BACKUP_DIR);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    let deletedCount = 0;
    
    files.forEach(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            deletedCount++;
        }
    });
    
    if (deletedCount > 0) {
        console.log(`🗑️  Deleted ${deletedCount} old backups (older than ${daysToKeep} days)`);
    }
}

async function main() {
    console.log('\n🔄 fut.invest - Database Backup');
    console.log('='.repeat(40));
    
    try {
        let backupFile;
        
        if (DB_TYPE === 'postgres') {
            backupFile = await backupPostgres();
        } else {
            backupFile = await backupSQLite();
        }
        
        // Cleanup old backups
        await cleanupOldBackups(30);
        
        // List all backups
        const files = fs.readdirSync(BACKUP_DIR);
        console.log(`\n📁 Backups directory (${files.length} files):`);
        files.forEach(f => {
            const stats = fs.statSync(path.join(BACKUP_DIR, f));
            const size = (stats.size / 1024 / 1024).toFixed(2);
            console.log(`   ${f} (${size} MB)`);
        });
        
        console.log('\n✅ Backup completed successfully\n');
    } catch (error) {
        console.error('❌ Backup failed:', error.message);
        process.exit(1);
    }
}

main();
