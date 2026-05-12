const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROLE_STAFF_ID = process.env.ROLE_STAFF_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const GUILD_ID = process.env.GUILD_ID;

let stock = {
  items: [
    { id: 1, name: "Rainbow Phoenix", price: 25, robloxItemId: 101 },
    { id: 2, name: "Golden Dragon", price: 50, robloxItemId: 102 },
    { id: 3, name: "Gold Clockwork Shades", price: 75, robloxItemId: 110673146052704 }
  ]
};

const activeTickets = new Map();
const activeUsernameRequests = new Map();

function saveTicketLog(ticketData) {
  const logFile = './ticket_logs.json';
  let existingLogs = [];
  try {
    if (fs.existsSync(logFile)) {
      existingLogs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
    }
  } catch (err) {}
  existingLogs.push({
    ...ticketData,
    timestamp: new Date().toISOString(),
    logId: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`
  });
  fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2));
}

async function logChannelMessages(channel, ticketInfo) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const messageLog = [];
    messages.reverse().forEach(msg => {
      messageLog.push({
        author: msg.author.tag,
        authorId: msg.author.id,
        content: msg.content || '[Embed]',
        timestamp: msg.createdAt.toISOString()
      });
    });
    const logData = {
      ticketId: channel.id,
      ticketName: channel.name,
      userId: ticketInfo.userId,
      username: ticketInfo.username || 'Unknown',
      item: ticketInfo.item,
      status: ticketInfo.status,
      robloxUserId: ticketInfo.robloxUserId || 'Not provided',
      robloxUsername: ticketInfo.robloxUsername || 'Not provided',
      tradeId: ticketInfo.tradeId || 'Not sent',
      createdAt: channel.createdAt.toISOString(),
      closedAt: new Date().toISOString(),
      messages: messageLog,
      messageCount: messageLog.length
    };
    saveTicketLog(logData);
    return logData;
  } catch (err) { return null; }
}

function getTicketLog(ticketId) {
  try {
    if (fs.existsSync('./ticket_logs.json')) {
      const logs = JSON.parse(fs.readFileSync('./ticket_logs.json', 'utf8'));
      return logs.find(log => log.ticketId === ticketId);
    }
  } catch (err) {}
  return null;
}

function getUserTicketLogs(userId) {
  try {
    if (fs.existsSync('./ticket_logs.json')) {
      const logs = JSON.parse(fs.readFileSync('./ticket_logs.json', 'utf8'));
      return logs.filter(log => log.userId === userId).reverse();
    }
  } catch (err) { return []; }
  return [];
}

async function closeTicket(channel, reason, ticketInfo) {
  if (!channel || !channel.deletable) return;
  if (ticketInfo) {
    ticketInfo.status = reason === 'cancelled' ? 'cancelled' : 'completed';
    ticketInfo.closedReason = reason;
    await logChannelMessages(channel, ticketInfo);
  }
  try {
    await channel.send(`📝 **Ticket closing...** Reason: ${reason}\nThis channel will close in 3 seconds.`);
    setTimeout(() => channel.delete().catch(() => {}), 3000);
  } catch (err) {}
  activeTickets.delete(channel.id);
}

async function fetchRobloxItemImage(itemId) {
  try {
    const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${itemId}&size=150x150&format=Png`;
    const response = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (response.data?.data?.[0]?.imageUrl) return response.data.data[0].imageUrl;
    return `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=150&height=150&format=png`;
  } catch (err) { return null; }
}

async function fetchRobloxUserAvatar(userId) {
  try {
    const url = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png`;
    const response = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (response.data?.data?.[0]?.imageUrl) return response.data.data[0].imageUrl;
    return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`;
  } catch (err) { return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`; }
}

async function updateAllItemImages() {
  for (let item of stock.items) {
    const imageUrl = await fetchRobloxItemImage(item.robloxItemId);
    if (imageUrl) item.imageUrl = imageUrl;
  }
  saveStock();
}

function saveStock() { fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2)); }
function loadStock() {
  try { if (fs.existsSync('./stock.json')) stock = JSON.parse(fs.readFileSync('./stock.json', 'utf8')); }
  catch (err) {}
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  loadStock();
  await updateAllItemImages();
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'stock', description: 'View current stock and purchase items' },
      { name: 'addstock', description: '[STAFF] Add an item to stock', options: [
        { name: 'name', type: 3, description: 'Item name', required: true },
        { name: 'price', type: 10, description: 'Price in USD', required: true },
        { name: 'robloxitemid', type: 4, description: 'Roblox Item ID', required: true }
      ]},
      { name: 'removestock', description: '[STAFF] Remove an item from stock', options: [
        { name: 'itemid', type: 4, description: 'Item ID to remove', required: true }
      ]},
      { name: 'refreshimages', description: '[STAFF] Refresh all item images' },
      { name: 'viewlogs', description: '[STAFF] View recent ticket logs' },
      { name: 'viewticket', description: '[STAFF] View a specific ticket log', options: [
        { name: 'ticketid', type: 3, description: 'Ticket channel ID', required: true }
      ]},
      { name: 'mytickets', description: 'View your own ticket history' }
    ]);
    console.log('✅ Commands registered!');
  }
});

async function findRobloxUserDirect(username) {
  try {
    const searchUrl = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`;
    const response = await axios.get(searchUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    if (response.data?.data?.length > 0) {
      const user = response.data.data[0];
      const avatarUrl = await fetchRobloxUserAvatar(user.id);
      return { id: user.id, name: user.name, displayName: user.displayName || user.name, profileUrl: `https://www.roblox.com/users/${user.id}/profile`, avatarUrl: avatarUrl };
    }
    return null;
  } catch (error) { return null; }
}

function searchStock(query) {
  const lowerQuery = query.toLowerCase();
  return stock.items.filter(item => item.name.toLowerCase().includes(lowerQuery) || String(item.robloxItemId).includes(query) || String(item.id).includes(query));
}

setInterval(() => console.log(`💓 Bot alive at ${new Date().toLocaleTimeString()}`), 240000);

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Running!'));
app.get('/logs', (req, res) => {
  try {
    if (fs.existsSync('./ticket_logs.json')) {
      const logs = JSON.parse(fs.readFileSync('./ticket_logs.json', 'utf8'));
      res.json(logs.slice(-50));
    } else { res.json([]); }
  } catch (err) { res.status(500).json({ error: 'Could not read logs' }); }
});
app.listen(process.env.PORT || 3000, () => console.log(`🌐 Web server on port ${process.env.PORT || 3000}`));

function createMainStockEmbed() {
  const embed = new EmbedBuilder().setTitle('📦 Current Stock').setDescription('Use the buttons below to browse or search').setColor(0x0099FF);
  stock.items.forEach(item => embed.addFields({ name: `${item.name}`, value: `💰 $${item.price} | 🆔 ID: ${item.id}`, inline: true }));
  return embed;
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    if (interaction.commandName === 'stock') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('search_modal_button').setLabel('🔍 Search Stock').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('view_all_ephemeral').setLabel('📋 View All Items').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('refresh_stock_view').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({ embeds: [createMainStockEmbed()], components: [row] });
    }
    else if (interaction.commandName === 'addstock' && interaction.member?.roles.cache.has(ROLE_STAFF_ID)) {
      const name = interaction.options.getString('name');
      const price = interaction.options.getNumber('price');
      const robloxItemId = interaction.options.getInteger('robloxitemid');
      const imageUrl = await fetchRobloxItemImage(robloxItemId);
      stock.items.push({ id: stock.items.length + 1, name, price, robloxItemId, imageUrl });
      saveStock();
      await interaction.reply(`✅ Added **${name}** for $${price}.`);
    }
    else if (interaction.commandName === 'removestock' && interaction.member?.roles.cache.has(ROLE_STAFF_ID)) {
      const itemId = interaction.options.getInteger('itemid');
      const index = stock.items.findIndex(i => i.id === itemId);
      if (index === -1) return interaction.reply(`❌ Item not found.`);
      const removed = stock.items.splice(index, 1)[0];
      saveStock();
      await interaction.reply(`✅ Removed **${removed.name}**.`);
    }
    else if (interaction.commandName === 'refreshimages' && interaction.member?.roles.cache.has(ROLE_STAFF_ID)) {
      await interaction.reply('🖼️ Refreshing images...');
      await updateAllItemImages();
      await interaction.followUp('✅ Images refreshed!');
    }
    else if (interaction.commandName === 'viewlogs' && interaction.member?.roles.cache.has(ROLE_STAFF_ID)) {
      try {
        if (fs.existsSync('./ticket_logs.json')) {
          const logs = JSON.parse(fs.readFileSync('./ticket_logs.json', 'utf8'));
          const recentLogs = logs.slice(-10).reverse();
          if (recentLogs.length === 0) { await interaction.reply('📝 No ticket logs found yet.'); return; }
          const logEmbed = new EmbedBuilder().setTitle('📝 Recent Ticket Logs').setDescription(`Last ${recentLogs.length} tickets\nUse \`/viewticket <ticketId>\` to see full conversation`).setColor(0x0099FF);
          recentLogs.forEach(log => {
            logEmbed.addFields({ name: `${log.ticketName} (${log.status})`, value: `User: <@${log.userId}>\nItem: ${log.item.name}\nMessages: ${log.messageCount}\nTicket ID: \`${log.ticketId}\``, inline: false });
          });
          await interaction.reply({ embeds: [logEmbed], ephemeral: true });
        } else { await interaction.reply('📝 No ticket logs found yet.'); }
      } catch (err) { await interaction.reply('❌ Error reading logs.'); }
    }
    else if (interaction.commandName === 'viewticket' && interaction.member?.roles.cache.has(ROLE_STAFF_ID)) {
      const ticketId = interaction.options.getString('ticketid');
      const log = getTicketLog(ticketId);
      if (!log) {
        await interaction.reply({ content: `❌ No ticket found with ID: ${ticketId}`, ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle(`📝 Ticket Log: ${log.ticketName}`)
        .setDescription(`**Status:** ${log.status}\n**User:** <@${log.userId}>\n**Item:** ${log.item.name}\n**Price:** $${log.item.price}\n**Roblox User:** ${log.robloxUsername || 'Not provided'}\n**Created:** ${new Date(log.createdAt).toLocaleString()}\n**Closed:** ${new Date(log.closedAt).toLocaleString()}\n**Total Messages:** ${log.messages.length}`)
        .setColor(0x0099FF);
      log.messages.slice(-20).forEach(msg => {
        embed.addFields({ name: `${msg.author}`, value: msg.content.substring(0, 100), inline: false });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    else if (interaction.commandName === 'mytickets') {
      const userLogs = getUserTicketLogs(interaction.user.id);
      if (userLogs.length === 0) {
        await interaction.reply({ content: '📝 You have no past tickets.', ephemeral: true });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('📝 Your Ticket History')
        .setDescription(`You have ${userLogs.length} past ticket(s)`)
        .setColor(0x0099FF);
      userLogs.slice(0, 10).forEach(log => {
        embed.addFields({ name: `${log.ticketName} (${log.status})`, value: `Item: ${log.item.name}\nClosed: ${new Date(log.closedAt).toLocaleString()}`, inline: false });
      });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
  
  else if (interaction.isModalSubmit() && interaction.customId === 'search_modal') {
    const query = interaction.fields.getTextInputValue('search_query');
    const results = searchStock(query);
    if (results.length === 0) return interaction.reply({ content: `❌ No items found matching "${query}".`, ephemeral: true });
    const resultEmbed = new EmbedBuilder().setTitle(`🔍 Search Results for "${query}"`).setDescription(`Found ${results.length} item(s)`).setColor(0x00FF00);
    const buttonRow = new ActionRowBuilder();
    results.slice(0, 5).forEach(item => {
      resultEmbed.addFields({ name: item.name, value: `💰 $${item.price} | ID: ${item.id}`, inline: false });
      buttonRow.addComponents(new ButtonBuilder().setCustomId(`purchase_${item.id}`).setLabel(`Buy ${item.name.substring(0, 20)}`).setStyle(ButtonStyle.Primary));
    });
    const backButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_stock').setLabel('◀ Back to Stock').setStyle(ButtonStyle.Secondary));
    await interaction.reply({ embeds: [resultEmbed], components: [buttonRow, backButton], ephemeral: true });
  }
  
  else if (interaction.isButton()) {
    const customId = interaction.customId;
    
    if (customId === 'back_to_stock' || customId === 'refresh_stock_view') {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('search_modal_button').setLabel('🔍 Search Stock').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('view_all_ephemeral').setLabel('📋 View All Items').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('refresh_stock_view').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
      );
      await interaction.update({ embeds: [createMainStockEmbed()], components: [row] });
    }
    
    else if (customId === 'view_all_ephemeral') {
      const embed = new EmbedBuilder().setTitle('📦 Complete Stock List').setDescription(`Total: ${stock.items.length} items`).setColor(0x0099FF);
      const buttons = new ActionRowBuilder();
      stock.items.forEach(item => {
        embed.addFields({ name: `${item.name} (ID: ${item.id})`, value: `💰 $${item.price} | Roblox ID: ${item.robloxItemId}`, inline: false });
        buttons.addComponents(new ButtonBuilder().setCustomId(`purchase_${item.id}`).setLabel(`Buy ${item.name.substring(0, 20)}`).setStyle(ButtonStyle.Primary));
      });
      const backButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('back_to_stock').setLabel('◀ Back to Stock').setStyle(ButtonStyle.Secondary));
      await interaction.reply({ embeds: [embed], components: [buttons, backButton], ephemeral: true });
    }
    
    else if (customId === 'search_modal_button') {
      const modal = new ModalBuilder().setCustomId('search_modal').setTitle('🔍 Search Stock');
      const searchInput = new TextInputBuilder().setCustomId('search_query').setLabel('Enter item name or ID').setStyle(TextInputStyle.Short).setPlaceholder('Example: Gold Clockwork Shades').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(searchInput));
      await interaction.showModal(modal);
    }
    
    else if (customId.startsWith('purchase_')) {
      const itemId = parseInt(customId.split('_')[1]);
      const item = stock.items.find(i => i.id === itemId);
      if (!item) return interaction.reply({ content: 'Item not found.', ephemeral: true });
      await interaction.reply({ content: 'Creating ticket...', ephemeral: true });
      const ticketName = `ticket-${interaction.user.username}`;
      const channel = await interaction.guild.channels.create({
        name: ticketName, type: ChannelType.GuildText, parent: TICKET_CATEGORY_ID,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
          { id: ROLE_STAFF_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
      });
      activeTickets.set(channel.id, { userId: interaction.user.id, username: interaction.user.username, item: item, status: 'awaiting_username' });
      const embed = new EmbedBuilder().setTitle(`🛒 Purchase: ${item.name}`).setDescription(`Price: **$${item.price}**\n\nType your Roblox username below to continue.`).setThumbnail(item.imageUrl).setColor(0x00FF00);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`request_username_${item.id}`).setLabel('💰 Continue to Purchase').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cancel_ticket_${channel.id}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
      );
      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
    }
    
    else if (customId.startsWith('cancel_ticket_')) {
      const channelId = customId.replace('cancel_ticket_', '');
      const channel = interaction.guild.channels.cache.get(channelId);
      const ticketInfo = activeTickets.get(channelId);
      await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
      if (channel && ticketInfo) {
        await closeTicket(channel, 'cancelled_by_user', ticketInfo);
      }
    }
    
    else if (customId.startsWith('request_username_')) {
      const itemId = parseInt(customId.split('_')[2]);
      const item = stock.items.find(i => i.id === itemId);
      await interaction.reply({ content: '✅ Ready! **Type your Roblox username below**', ephemeral: false });
      activeUsernameRequests.set(interaction.user.id, { channelId: interaction.channel.id, item: item });
      await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**`);
    }
    
    else if (customId === 'trade_accepted') {
      const ticketInfo = activeTickets.get(interaction.channel.id);
      if (ticketInfo && ticketInfo.status === 'trade_sent') {
        ticketInfo.status = 'completed';
        await interaction.reply({ content: '✅ Purchase complete!', ephemeral: true });
        await closeTicket(interaction.channel, 'completed', ticketInfo);
      }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const pendingRequest = activeUsernameRequests.get(message.author.id);
  if (!pendingRequest || message.channel.id !== pendingRequest.channelId) return;
  const username = message.content.trim();
  if (username.startsWith('/')) return;
  const item = pendingRequest.item;
  const ticketInfo = activeTickets.get(message.channel.id);
  const searchingMsg = await message.channel.send(`🔍 Searching Roblox for **${username}**...`);
  const robloxUser = await findRobloxUserDirect(username);
  await searchingMsg.delete();
  if (!robloxUser) {
    await message.channel.send(`❌ **Roblox user "${username}" not found**\n\nPlease check spelling and try again:`);
    return;
  }
  if (ticketInfo) { 
    ticketInfo.robloxUserId = robloxUser.id; 
    ticketInfo.robloxUsername = robloxUser.name; 
    ticketInfo.status = 'awaiting_confirmation'; 
  }
  activeUsernameRequests.delete(message.author.id);
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Is this your Roblox profile?')
    .setDescription(`**Username:** ${robloxUser.name}\n**Display Name:** ${robloxUser.displayName}\n**User ID:** ${robloxUser.id}`)
    .addFields({ name: 'Profile Link', value: robloxUser.profileUrl })
    .setImage(robloxUser.avatarUrl).setColor(0x00FF00);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`confirm_trade_${item.id}_${robloxUser.id}`).setLabel('✅ Yes, That\'s Me').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`retry_username_${item.id}`).setLabel('🔄 Retry - Wrong User').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cancel_ticket_${message.channel.id}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
  );
  await message.channel.send({ embeds: [confirmEmbed], components: [row] });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  const customId = interaction.customId;
  
  if (customId.startsWith('confirm_trade_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[2]);
    const robloxUserId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    const ticketInfo = activeTickets.get(interaction.channel.id);
    await interaction.reply({ content: `✅ Confirmed! Sending ${item.name}...`, ephemeral: true });
    const tradeId = `trade_${Date.now()}_${robloxUserId}`;
    if (ticketInfo) { ticketInfo.status = 'trade_sent'; ticketInfo.tradeId = tradeId; }
    await interaction.channel.send(`📦 Trade offer sent for **${item.name}**!\n\nAfter accepting on Roblox, click the "Trade Accepted" button below.`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('trade_accepted').setLabel('✅ I Accepted the Trade').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cancel_ticket_${interaction.channel.id}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
    );
    await interaction.channel.send({ content: `<@${interaction.user.id}>`, components: [row] });
  }
  
  else if (customId.startsWith('retry_username_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    await interaction.reply({ content: '🔄 Please type a different Roblox username.', ephemeral: true });
    activeUsernameRequests.set(interaction.user.id, { channelId: interaction.channel.id, item: item });
    await interaction.channel.send(`📝 **Please type your CORRECT Roblox username:**`);
  }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting successfully!');
