import express from 'express';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import axios from 'axios';
import fs from 'fs/promises';
import config from './config.js';

const app = express();
app.use(express.json());
// Serve index.html for all routes (except API)
app.use(express.static('.', { index: 'index.html' }));

app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' });
});

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') res.sendStatus(200);
  else next();
});

// ============================================
// DATABASE FUNCTIONS
// ============================================
const readDB = async () => {
  try {
    const data = await fs.readFile('database.json', 'utf8');
    const parsed = JSON.parse(data);
    // Ensure all required arrays exist
    return {
      users: parsed.users || [],
      employees: parsed.employees || [],
      settings: parsed.settings || {}
    };
  } catch {
    return { users: [], employees: [], settings: {} };
  }
};

const writeDB = async (data) => {
  await fs.writeFile('database.json', JSON.stringify(data, null, 2));
};

// ============================================
// SIGNUP API
// ============================================

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.json({ success: false, message: 'All fields required' });
  }

  if (password.length < 6) {
    return res.json({ success: false, message: 'Password min 6 chars' });
  }

  const db = await readDB();

  // Check if email already exists
  if (db.users.find(u => u.email === email)) {
    return res.json({ success: false, message: 'Email already registered' });
  }

  const newUser = {
    id: Date.now().toString(),
    name,
    email,
    password, // In production, hash this!
    createdAt: new Date().toISOString()
  };

  db.users.push(newUser);
  await writeDB(db);

  res.json({ success: true, message: 'Account created successfully' });
});

// ============================================
// LOGIN API
// ============================================

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const db = await readDB();
  const user = db.users.find(u => u.email === email && u.password === password);

  if (user) {
    res.json({
      success: true,
      name: user.name,
      email: user.email,
      message: 'Login successful'
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// ============================================
// GET ALL EMPLOYEES (Per User)
// ============================================

app.get('/api/employees', async (req, res) => {
  const userEmail = req.query.user;

  if (!userEmail) {
    return res.status(401).json({ success: false, message: 'User email required' });
  }

  const db = await readDB();
  const userEmployees = db.employees.filter(e => e.userEmail === userEmail);

  res.json({ success: true, data: userEmployees });
});

// ============================================
// ADD EMPLOYEE
// ============================================

app.post('/api/employees', async (req, res) => {
  const { qidNumber, fullName, nationality, gender, rpExpiryDate, userEmail } = req.body;

  if (!qidNumber || !fullName || !nationality || !gender || !rpExpiryDate || !userEmail) {
    return res.status(400).json({ success: false, message: 'All fields required' });
  }

  const db = await readDB();

  const newEmployee = {
    id: Date.now().toString(),
    userEmail,
    serialNumber: (db.employees.filter(e => e.userEmail === userEmail).length + 1),
    qidNumber,
    fullName,
    nationality,
    gender,
    rpExpiryDate,
    notificationsSent: [],
    createdAt: new Date().toISOString()
  };

  db.employees.push(newEmployee);
  await writeDB(db);

  res.json({ success: true, data: newEmployee });
});

// ============================================
// UPDATE EMPLOYEE
// ============================================

app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const { userEmail } = req.body;

  const db = await readDB();
  const index = db.employees.findIndex(e => e.id === id && e.userEmail === userEmail);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  db.employees[index] = { ...db.employees[index], ...req.body };
  await writeDB(db);

  res.json({ success: true, data: db.employees[index] });
});

// ============================================
// DELETE EMPLOYEE
// ============================================

app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const { userEmail } = req.body;

  const db = await readDB();
  db.employees = db.employees.filter(e => !(e.id === id && e.userEmail === userEmail));

  await writeDB(db);

  res.json({ success: true });
});

// ============================================
// SEND EMAIL
// ============================================

const sendEmail = async (employee, daysLeft, userEmail) => {
  const db = await readDB();
  const userSettings = db.settings[userEmail] || {};

  if (!userSettings.gmail || !userSettings.gmailPassword) {
    console.log('⚠️ Email not configured for', userEmail);
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: userSettings.gmail,
      pass: userSettings.gmailPassword
    }
  });

  const html = `
    <div style="font-family: Arial; max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">🔔 RP EXPIRY ALERT</h1>
      </div>
      <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
        <div style="background: ${daysLeft <= 15 ? '#ffebee' : '#fffde7'}; border-left: 4px solid ${daysLeft <= 15 ? '#d32f2f' : '#fbc02d'}; padding: 20px; margin: 20px 0; border-radius: 5px;">
          <h2 style="margin-top: 0; color: ${daysLeft <= 15 ? '#d32f2f' : '#f57f17'};">⚠️ URGENT ACTION REQUIRED!</h2>
          <p style="font-size: 18px; margin: 10px 0; font-weight: bold;">RP expires in <span style="color: ${daysLeft <= 15 ? '#d32f2f' : '#f57f17'}">${daysLeft} days</span></p>
        </div>
        
        <h3 style="color: #333; border-bottom: 2px solid #667eea; padding-bottom: 10px;">Employee Details:</h3>
        
        <table style="width: 100%; margin: 20px 0;">
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 10px; font-weight: bold; width: 40%; color: #666;">Full Name:</td>
            <td style="padding: 10px; color: #333;">${employee.fullName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 10px; font-weight: bold; color: #666;">QID Number:</td>
            <td style="padding: 10px; color: #333;">${employee.qidNumber}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 10px; font-weight: bold; color: #666;">Nationality:</td>
            <td style="padding: 10px; color: #333;">${employee.nationality}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e0e0e0;">
            <td style="padding: 10px; font-weight: bold; color: #666;">Gender:</td>
            <td style="padding: 10px; color: #333;">${employee.gender}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #666;">RP Expiry Date:</td>
            <td style="padding: 10px; color: #d32f2f; font-weight: bold; font-size: 16px;">${employee.rpExpiryDate}</td>
          </tr>
        </table>

        <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;"><strong>⚡ Action Required:</strong></p>
          <p style="margin: 10px 0; color: #666;">Please process the RP renewal immediately to avoid legal complications and work disruptions.</p>
        </div>

        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
          This is an automated notification from RP Tracker System<br>
          © 2025 RP Tracker - Professional Employee Management
        </p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"RP Tracker Alert" <${userSettings.gmail}>`,
      to: userSettings.notifEmail || userSettings.gmail,
      subject: `🔔 URGENT: RP Expiry Alert - ${employee.fullName} (${daysLeft} days left)`,
      html: html
    });

    console.log(`✅ Email sent to ${userSettings.notifEmail || userSettings.gmail}: ${employee.fullName}`);
    return true;
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return false;
  }
};

// ============================================
// SEND TELEGRAM
// ============================================

const sendTelegram = async (employee, daysLeft, userEmail) => {
  const db = await readDB();
  const userSettings = db.settings[userEmail] || {};

  if (!userSettings.telegramToken || !userSettings.telegramChat) {
    return false;
  }

  const message = `
🔔 *RP EXPIRY ALERT* 🔔

⚠️ *URGENT - Action Required!*

👤 *Name:* ${employee.fullName}
🆔 *QID:* ${employee.qidNumber}
🌍 *Nationality:* ${employee.nationality}
📅 *Expiry Date:* \`${employee.rpExpiryDate}\`
⏰ *Days Remaining:* *${daysLeft} DAYS*

🚨 Please process RP renewal immediately!
  `;

  try {
    await axios.post(
      `https://api.telegram.org/bot${userSettings.telegramToken}/sendMessage`,
      {
        chat_id: userSettings.telegramChat,
        text: message,
        parse_mode: 'Markdown'
      }
    );

    console.log(`✅ Telegram sent: ${employee.fullName}`);
    return true;
  } catch (error) {
    console.error('❌ Telegram error:', error.message);
    return false;
  }
};

// ============================================
// SEND TEST NOTIFICATION
// ============================================

app.post('/api/send-notification', async (req, res) => {
  const { employee, daysLeft, userEmail } = req.body;

  if (!employee || !userEmail) {
    return res.status(400).json({ success: false, message: 'Missing data' });
  }

  let emailSent = false;
  let telegramSent = false;

  emailSent = await sendEmail(employee, daysLeft, userEmail);
  telegramSent = await sendTelegram(employee, daysLeft, userEmail);

  const message = [];
  if (emailSent) message.push('✅ Email sent');
  if (telegramSent) message.push('✅ Telegram sent');
  if (!emailSent && !telegramSent) message.push('⚠️ No channels configured');

  res.json({
    success: true,
    message: message.join(' | ')
  });
});

// ============================================
// CHECK & SEND NOTIFICATIONS (Main Logic)
// ============================================

const checkAndSendNotifications = async () => {
  console.log('🔍 Checking RP expiry dates...');

  const db = await readDB();
  const today = new Date();
  const remindDays = [30, 15];
  let totalNotifications = 0;

  console.log('📊 Total Employees:', db.employees.length);
  console.log('👥 Registered Users:', db.users.length);
  console.log('⚙️ Settings:', Object.keys(db.settings));

  for (const employee of db.employees) {
    const expiryDate = new Date(employee.rpExpiryDate);
    const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

    console.log(`\n📌 Employee: ${employee.fullName}`);
    console.log(`   - QID: ${employee.qidNumber}`);
    console.log(`   - Expiry: ${employee.rpExpiryDate}`);
    console.log(`   - Days Left: ${daysUntilExpiry}`);
    console.log(`   - User Email: ${employee.userEmail}`);
    console.log(`   - Has Settings: ${db.settings[employee.userEmail] ? '✅' : '❌'}`);

    // Initialize notifications array if not exists
    if (!employee.notificationsSent) {
      employee.notificationsSent = [];
    }

    for (const remindDay of remindDays) {
      if (daysUntilExpiry === remindDay) {
        console.log(`   ⚠️ MATCH FOUND! Days = ${remindDay}`);
        
        const logKey = `${employee.id}-${remindDay}`;
        
        // Check if already sent today
        const today_str = new Date().toISOString().split('T')[0];
        const sentToday = employee.notificationsSent.filter(
          n => n.date === today_str && n.days === remindDay
        );

        console.log(`   - Sent today count: ${sentToday.length}/3`);

        // Send 3 times per day (9 AM, 12 PM, 5 PM) if not already sent
        if (sentToday.length < 3) {
          console.log(`📌 Sending notification #${sentToday.length + 1}: ${employee.fullName} - ${daysUntilExpiry} days`);

          const emailResult = await sendEmail(employee, daysUntilExpiry, employee.userEmail);
          const telegramResult = await sendTelegram(employee, daysUntilExpiry, employee.userEmail);

          console.log(`   - Email Result: ${emailResult ? '✅' : '❌'}`);
          console.log(`   - Telegram Result: ${telegramResult ? '✅' : '❌'}`);

          // Log notification
          employee.notificationsSent.push({
            date: today_str,
            days: remindDay,
            sentAt: new Date().toISOString(),
            count: sentToday.length + 1
          });

          totalNotifications++;
        }
      }
    }
  }

  // Update notification log
  db.settings.lastCheck = new Date().toISOString();
  await writeDB(db);

  console.log(`\n✅ Check complete. Sent ${totalNotifications} notifications.`);
  return totalNotifications;
};

// ============================================
// MANUAL TRIGGER API
// ============================================

app.post('/api/check-notifications', async (req, res) => {
  const count = await checkAndSendNotifications();
  res.json({ success: true, message: '✅ Notification check completed', count });
});

// ============================================
// SAVE USER SETTINGS
// ============================================

app.post('/api/save-settings', async (req, res) => {
  const { gmail, gmailPassword, notifEmail, telegramToken, telegramChat, userEmail } = req.body;

  if (!userEmail) {
    return res.status(401).json({ success: false, message: 'User not authenticated' });
  }

  const db = await readDB();
  db.settings[userEmail] = {
    gmail,
    gmailPassword,
    notifEmail,
    telegramToken,
    telegramChat,
    updatedAt: new Date().toISOString()
  };

  await writeDB(db);

  res.json({ success: true, message: 'Settings saved successfully' });
});

// ============================================
// CRON JOB - Run 3 times per day
// ============================================

// 9 AM
cron.schedule('0 9 * * *', () => {
  console.log('⏰ [9 AM] Running scheduled check...');
  checkAndSendNotifications();
});

// 12 PM (Noon)
cron.schedule('0 12 * * *', () => {
  console.log('⏰ [12 PM] Running scheduled check...');
  checkAndSendNotifications();
});

// 5 PM
cron.schedule('0 17 * * *', () => {
  console.log('⏰ [5 PM] Running scheduled check...');
  checkAndSendNotifications();
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'RP Tracker Server Running',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(config.PORT, () => {
  console.log('\n🚀 RP TRACKER SERVER STARTED!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 URL: http://localhost:${config.PORT}`);
  console.log(`👥 Multi-User Support: ✅ Enabled`);
  console.log(`📧 Email Notifications: Configured per user`);
  console.log(`📱 Telegram Notifications: Configured per user`);
  console.log(`⏰ Cron Jobs: 9 AM | 12 PM | 5 PM`);
  console.log(`🔔 Reminders: 30 & 15 days before expiry`);
  console.log(`📢 Per Day Messages: 3 times (if expiring)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
