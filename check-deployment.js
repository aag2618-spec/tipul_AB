#!/usr/bin/env node

// סקריפט לבדיקת סטטוס deployment ב-Render
// שימוש: node check-deployment.js

const https = require('https');

// הגדרות - תצטרך למלא את אלה
const RENDER_API_KEY = process.env.RENDER_API_KEY || 'YOUR_API_KEY_HERE';
const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'YOUR_SERVICE_ID_HERE';

// צבעים לטרמינל
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.render.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${RENDER_API_KEY}`,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function getLatestDeploy() {
  try {
    log('\n🔍 מחפש את ה-deployment האחרון...', 'cyan');
    
    const deploys = await makeRequest(`/v1/services/${SERVICE_ID}/deploys?limit=1`);
    
    if (!deploys || deploys.length === 0) {
      log('❌ לא נמצאו deployments', 'red');
      return null;
    }

    return deploys[0];
  } catch (error) {
    log(`❌ שגיאה: ${error.message}`, 'red');
    
    if (error.message.includes('401') || error.message.includes('403')) {
      log('\n💡 נראה שה-API key לא תקין. בדוק את ההוראות למטה.', 'yellow');
    }
    
    return null;
  }
}

async function watchDeploy(deployId) {
  log(`\n👀 עוקב אחרי deployment: ${deployId}`, 'blue');
  log('━'.repeat(60), 'blue');

  const startTime = Date.now();
  let lastStatus = null;

  while (true) {
    try {
      const deploy = await makeRequest(`/v1/services/${SERVICE_ID}/deploys/${deployId}`);
      
      if (deploy.status !== lastStatus) {
        lastStatus = deploy.status;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        
        switch (deploy.status) {
          case 'created':
          case 'build_in_progress':
            log(`⏳ [${elapsed}s] בונה... (${deploy.status})`, 'yellow');
            break;
          case 'update_in_progress':
            log(`🔄 [${elapsed}s] מעדכן...`, 'yellow');
            break;
          case 'live':
            log(`✅ [${elapsed}s] הצליח! האתר עלה לאוויר! 🎉`, 'green');
            log(`\n🌐 כתובת: https://your-app.onrender.com`, 'cyan');
            return true;
          case 'build_failed':
          case 'update_failed':
          case 'canceled':
            log(`❌ [${elapsed}s] נכשל! סטטוס: ${deploy.status}`, 'red');
            
            if (deploy.finishedAt) {
              log(`\n📋 הצג לוגים ב: https://dashboard.render.com/web/${SERVICE_ID}`, 'yellow');
            }
            return false;
          default:
            log(`ℹ️  [${elapsed}s] ${deploy.status}`, 'blue');
        }
      }

      if (['live', 'build_failed', 'update_failed', 'canceled'].includes(deploy.status)) {
        break;
      }

      // המתן 5 שניות לפני הבדיקה הבאה
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      log(`⚠️  שגיאה בבדיקת סטטוס: ${error.message}`, 'red');
      break;
    }
  }
}

async function main() {
  log('╔════════════════════════════════════════════════╗', 'cyan');
  log('║   🚀 בודק Deployment ב-Render                ║', 'cyan');
  log('╚════════════════════════════════════════════════╝', 'cyan');

  // בדיקה שיש API key
  if (RENDER_API_KEY === 'YOUR_API_KEY_HERE') {
    log('\n❌ חסר API Key!', 'red');
    log('\n📝 הוראות הגדרה:', 'yellow');
    log('1. היכנס ל: https://dashboard.render.com/u/settings#api-keys', 'yellow');
    log('2. לחץ "Create API Key"', 'yellow');
    log('3. העתק את ה-key', 'yellow');
    log('4. הרץ את הפקודה הבאה (החלף YOUR_KEY):', 'yellow');
    log('   $env:RENDER_API_KEY="rnd_YOUR_KEY_HERE"', 'cyan');
    log('   $env:RENDER_SERVICE_ID="srv-YOUR_SERVICE_ID"', 'cyan');
    log('   node check-deployment.js', 'cyan');
    process.exit(1);
  }

  if (SERVICE_ID === 'YOUR_SERVICE_ID_HERE') {
    log('\n❌ חסר Service ID!', 'red');
    log('\n📝 למצוא את ה-Service ID:', 'yellow');
    log('1. היכנס ל: https://dashboard.render.com', 'yellow');
    log('2. לחץ על השירות שלך (tipul)', 'yellow');
    log('3. ה-URL יראה כך: https://dashboard.render.com/web/srv-XXXXX', 'yellow');
    log('4. ה-srv-XXXXX זה ה-Service ID שלך', 'yellow');
    process.exit(1);
  }

  const deploy = await getLatestDeploy();
  
  if (!deploy) {
    process.exit(1);
  }

  log(`\n📦 Deployment ID: ${deploy.deploy.id}`, 'blue');
  log(`📅 התחיל ב: ${new Date(deploy.deploy.createdAt).toLocaleString('he-IL')}`, 'blue');
  log(`📊 סטטוס נוכחי: ${deploy.deploy.status}`, 'blue');

  if (['live'].includes(deploy.deploy.status)) {
    log(`\n✅ ה-deployment כבר הושלם!`, 'green');
  } else {
    await watchDeploy(deploy.deploy.id);
  }

  log('\n' + '━'.repeat(60), 'cyan');
  log('✨ סיימתי!', 'cyan');
}

main().catch((error) => {
  log(`\n❌ שגיאה כללית: ${error.message}`, 'red');
  process.exit(1);
});
