const Telegraf = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Store user data in memory (chat_id: {email_info, verified})
const users = {};

bot.start((ctx) => {
  ctx.reply(`Welcome to Temp Mail Bot! 📧\nPlease join our channel ${process.env.CHANNEL_USERNAME} to use the bot.\nAfter joining, use /verify to activate the bot.\nCommands: /new, /check, /delete`);
  if (!users[ctx.chat.id]) {
    users[ctx.chat.id] = { email: null, token: null, verified: false };
  }
});

bot.command('verify', async (ctx) => {
  try {
    const member = await bot.telegram.getChatMember(process.env.CHANNEL_USERNAME, ctx.chat.id);
    if (member.status === 'member' || member.status === 'administrator' || member.status === 'creator') {
      users[ctx.chat.id].verified = true;
      ctx.reply('Verification successful! 🎉\nYou can now use: /new, /check, /delete');
    } else {
      ctx.reply(`Please join ${process.env.CHANNEL_USERNAME} first, then use /verify again.`);
    }
  } catch (e) {
    console.error(`Error verifying user ${ctx.chat.id}:`, e);
    ctx.reply(`Error: Could not verify. Ensure you joined ${process.env.CHANNEL_USERNAME} and try again.`);
  }
});

function checkVerification(ctx) {
  if (!users[ctx.chat.id] || !users[ctx.chat.id].verified) {
    ctx.reply(`Please join ${process.env.CHANNEL_USERNAME} and use /verify to activate the bot.`);
    return false;
  }
  return true;
}

bot.command('new', async (ctx) => {
  if (!checkVerification(ctx)) return;

  try {
    const domainsResponse = await axios.get('https://api.mail.tm/domains');
    const domain = domainsResponse.data.hydra:member[0].domain;

    const email = `user${Date.now()}@${domain}`;
    const password = `pass${Date.now()}`;

    const accountResponse = await axios.post('https://api.mail.tm/accounts', { address: email, password });
    const tokenResponse = await axios.post('https://api.mail.tm/token', { address: email, password });

    users[ctx.chat.id].email = email;
    users[ctx.chat.id].token = tokenResponse.data.token;
    ctx.reply(`Your new temporary email is: ${email}`);
  } catch (e) {
    console.error(`Error creating email:`, e);
    ctx.reply('Error: Something went wrong. Try again.');
  }
});

bot.command('check', async (ctx) => {
  if (!checkVerification(ctx)) return;

  if (!users[ctx.chat.id].email) {
    ctx.reply('No email found. Use /new to create one.');
    return;
  }

  try {
    const response = await axios.get('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${users[ctx.chat.id].token}` },
    });
    const messages = response.data.hydra:member;

    if (!messages.length) {
      ctx.reply('Your inbox is empty.');
      return;
    }

    let reply = 'Inbox:\n';
    messages.slice(0, 5).forEach(msg => {
      reply += `From: ${msg.from.address}\nSubject: ${msg.subject}\n\n`;
    });
    ctx.reply(reply);
  } catch (e) {
    console.error(`Error checking inbox:`, e);
    ctx.reply('Error: Could not check inbox.');
  }
});

bot.command('delete', async (ctx) => {
  if (!checkVerification(ctx)) return;

  if (!users[ctx.chat.id].email) {
    ctx.reply('No email found. Use /new to create one.');
    return;
  }

  try {
    await axios.delete(`https://api.mail.tm/accounts/${users[ctx.chat.id].email}`, {
      headers: { Authorization: `Bearer ${users[ctx.chat.id].token}` },
    });
    ctx.reply('Email deleted successfully.');
    users[ctx.chat.id].email = null;
    users[ctx.chat.id].token = null;
  } catch (e) {
    console.error(`Error deleting email:`, e);
    ctx.reply('Error: Could not delete email.');
  }
});

bot.command('broadcast', (ctx) => {
  if (ctx.chat.id.toString() !== process.env.ADMIN_ID) {
    ctx.reply('You are not authorized to use this command.');
    return;
  }

  const args = ctx.message.text.split(' ').slice(1).join(' ');
  if (!args) {
    ctx.reply('Please provide a message to broadcast. Usage: /broadcast <message>');
    return;
  }

  let sentCount = 0;
  for (const userId in users) {
    try {
      bot.telegram.sendMessage(userId, `Admin Broadcast: ${args}`);
      sentCount++;
    } catch (e) {
      console.error(`Error sending broadcast to ${userId}:`, e);
    }
  }
  ctx.reply(`Broadcast sent to ${sentCount} users.`);
});

// Export handler for Vercel
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (err) {
      console.error('Error handling update:', err);
      res.status(500).send('Error');
    }
  } else {
    res.status(200).send('Telegram bot is running with webhook!');
  }
};