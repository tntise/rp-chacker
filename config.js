// ============================================
// 🔧 ALL SETTINGS HERE - CHANGE THESE VALUES
// ============================================

export default {
  // Server Port
  PORT: 5000,

  // Admin Login
  ADMIN_EMAIL: 'admin@company.com',
  ADMIN_PASSWORD: 'admin123',

  // Gmail Settings (Notification pathabe)
  GMAIL: {
    USER: 'your-email@gmail.com',           // ← Tomar Gmail
    PASSWORD: 'your-app-password',          // ← Gmail App Password
    SEND_TO: 'admin@company.com'            // ← Ke email pabe
  },

  // Telegram Settings
  TELEGRAM: {
    BOT_TOKEN: 'YOUR_BOT_TOKEN',            // ← @BotFather theke nao
    CHAT_ID: 'YOUR_CHAT_ID',                // ← Tomar chat ID
    ENABLED: false                          // ← true kore dao jodi use korbe
  },

  // SMS Settings (Optional - Twilio/Other)
  SMS: {
    API_KEY: '',
    PHONE: '+974xxxxxxxx',
    ENABLED: false
  },

  // Notification Days
  REMIND_DAYS: [30, 15],                    // 30 & 15 din age alert

  // Cron Schedule (Daily 9 AM check)
  CRON_SCHEDULE: '0 9 * * *'
};