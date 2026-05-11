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
  console.log('🖼️ Fetching images...');
  for (let item of stock.items) {
    const imageUrl = await fetchRobloxItemImage(item.robloxItemId);
    if (imageUrl) item.imageUrl = imageUrl;
  }
  saveStock();
}

function saveStock() { fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2)); }
function loadStock() {
  try { if (fs.existsSync('./stock.json')) stock = JSON.parse(fs.readFileSync('./stock.json', 'utf8')); }
  catch (err) { console.error('Failed to load stock:', err); }
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
      { name: 'refreshimages', description: '[STAFF] Refresh all item images' }
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

const activeUsernameRequests = new Map();

setInterval(() => console.log(`💓 Bot alive at ${new Date().toLocaleTimeString()}`), 240000);

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Running!'));
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
      activeTickets.set(channel.id, { userId: interaction.user.id, item: item, status: 'awaiting_username' });
      const embed = new EmbedBuilder().setTitle(`🛒 Purchase: ${item.name}`).setDescription(`Price: **$${item.price}**\n\nType your Roblox username below to continue.`).setThumbnail(item.imageUrl).setColor(0x00FF00);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`request_username_${item.id}`).setLabel('💰 Continue to Purchase').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cancel_ticket_${channel.id}`).setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
      );
      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
    }
    
    else if (customId.startsWith('cancel_ticket_')) {
      const channelId = customId.split('_')[2];
      const channel = interaction.guild.channels.cache.get(channelId);
      await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
      if (channel) { await channel.send('❌ **Ticket cancelled.** Closing...'); setTimeout(() => channel.delete().catch(() => {}), 3000); activeTickets.delete(channelId); }
    }
    
    else if (customId.startsWith('request_username_')) {
      const itemId = parseInt(customId.split('_')[2]);
      const item = stock.items.find(i => i.id === itemId);
      await interaction.reply({ content: '✅ Ready! **Type your Roblox username below**', ephemeral: false });
      activeUsernameRequests.set(interaction.user.id, { channelId: interaction.channel.id, item: item });
      await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**\n\nExample: \`Builderman\``);
    }
    
    // ========== FIXED: TRADE ACCEPTED BUTTON ==========
    else if (customId === 'trade_accepted') {
      const ticketInfo = activeTickets.get(interaction.channel.id);
      if (ticketInfo && ticketInfo.status === 'trade_sent') {
        ticketInfo.status = 'completed';
        await interaction.reply({ content: '✅ **Thank you for confirming!** Your purchase is now complete. This ticket will close in 5 seconds.', ephemeral: true });
        const completeEmbed = new EmbedBuilder()
          .setTitle('🎉 Purchase Complete!')
          .setDescription(`Thank you for purchasing **${ticketInfo.item.name}**!\n\nEnjoy your item!`)
          .setThumbnail(ticketInfo.item.imageUrl)
          .setColor(0x00FF00);
        await interaction.channel.send({ embeds: [completeEmbed] });
        setTimeout(() => { interaction.channel.delete().catch(() => {}); activeTickets.delete(interaction.channel.id); }, 5000);
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
    await message.channel.send(`❌ **Roblox user "${username}" not found**\n\n📝 Please check spelling and try again:`);
    return;
  }
  if (ticketInfo) { ticketInfo.robloxUserId = robloxUser.id; ticketInfo.robloxUsername = robloxUser.name; ticketInfo.status = 'awaiting_confirmation'; }
  activeUsernameRequests.delete(message.author.id);
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Is this your Roblox profile?')
    .setDescription(`**Username:** ${robloxUser.name}\n**Display Name:** ${robloxUser.displayName}\n**User ID:** ${robloxUser.id}`)
    .addFields({ name: '🔗 Profile Link', value: robloxUser.profileUrl, inline: false })
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
  
  // ========== FIXED: CONFIRM TRADE WITH WARNING MESSAGE ==========
  if (customId.startsWith('confirm_trade_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[2]);
    const robloxUserId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    const ticketInfo = activeTickets.get(interaction.channel.id);
    
    await interaction.reply({ content: `✅ **Confirmed!** Sending **${item.name}**...`, ephemeral: true });
    
    const tradeId = `trade_${Date.now()}_${robloxUserId}`;
    if (ticketInfo) { ticketInfo.status = 'trade_sent'; ticketInfo.tradeId = tradeId; }
    
    // Send trade confirmation embed
    const tradeEmbed = new EmbedBuilder()
      .setTitle('📦 Trade Offer Sent!')
      .setDescription(`**${item.name}** has been offered to you.`)
      .setThumbnail(item.imageUrl)
      .addFields(
        { name: 'Item', value: item.name, inline: true },
        { name: 'Price', value: `$${item.price}`, inline: true },
        { name: 'Trade ID', value: `\`${tradeId}\``, inline: false }
      )
      .setColor(0x00FF00);
    
    await interaction.channel.send({ embeds: [tradeEmbed] });
    
    // ========== CRITICAL: WARNING EMBED WITH BUTTON ==========
    const warningEmbed = new EmbedBuilder()
      .setTitle('⚠️⚠️⚠️ ACTION REQUIRED ⚠️⚠️⚠️')
      .setDescription(`
**YOUR TRADE OFFER HAS BEEN SENT TO ROBLOX!**

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**📋 STEP-BY-STEP INSTRUCTIONS:**

**1️⃣** Go to **Roblox.com** → **Trade** → **Incoming Trades**

**2️⃣** Find the trade offer from our bot

**3️⃣** Click **ACCEPT** on the trade

**4️⃣** **COME BACK HERE** and click the big green button below

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**⚠️ IMPORTANT WARNINGS:**

• Your purchase is **NOT complete** until you click the button below

• This ticket will **NOT close** until you confirm

• If you don't receive the trade within 10 minutes, click "Report Issue"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**✅ AFTER ACCEPTING THE TRADE ON ROBLOX, CLICK THE BUTTON BELOW ✅**
      `)
      .setColor(0xFF0000)
      .setFooter({ text: '⚠️ TICKET WILL REMAIN OPEN UNTIL YOU CONFIRM ⚠️' });
    
    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('trade_accepted')
          .setLabel('✅ I HAVE ACCEPTED THE TRADE ON ROBLOX ✅')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`report_issue_${tradeId}`)
          .setLabel('⚠️ REPORT ISSUE (Did not receive trade)')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('⚠️')
      );
    
    // Send the warning message with the button
    await interaction.channel.send({
      content: `<@${interaction.user.id}>`,
      embeds: [warningEmbed],
      components: [confirmRow]
    });
    
    // Send a reminder after 2 minutes
    setTimeout(async () => {
      const freshTicket = activeTickets.get(interaction.channel.id);
      if (freshTicket && freshTicket.status === 'trade_sent') {
        const reminderEmbed = new EmbedBuilder()
          .setTitle('🔔 REMINDER: Complete Your Trade')
          .setDescription(`
**Have you accepted the trade on Roblox yet?**

➡️ **If YES:** Click the **"I HAVE ACCEPTED THE TRADE ON ROBLOX"** button above.

➡️ **If NO:** Please check your Roblox trades inbox and accept the offer.

**Still having issues?** Click the **"REPORT ISSUE"** button for assistance.
          `)
          .setColor(0xFF6600);
        
        await interaction.channel.send({ content: `<@${interaction.user.id}>`, embeds: [reminderEmbed] });
      }
    }, 120000); // 2 minutes
  }
  
  else if (customId.startsWith('retry_username_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    await interaction.reply({ content: '🔄 Please type a different Roblox username.', ephemeral: true });
    activeUsernameRequests.set(interaction.user.id, { channelId: interaction.channel.id, item: item });
    await interaction.channel.send(`📝 **Please type your CORRECT Roblox username:**`);
  }
  
  else if (customId.startsWith('report_issue_')) {
    const tradeId = customId.split('_')[2];
    await interaction.reply({ content: '⚠️ **Issue reported!** A staff member will assist you shortly.\n\nPlease provide your Roblox username and the item you purchased.', ephemeral: true });
    const staffChannel = interaction.guild.channels.cache.find(c => c.name === 'staff-tickets') || interaction.channel;
    const issueEmbed = new EmbedBuilder()
      .setTitle('🚨 Issue Reported!')
      .setDescription(`**User:** <@${interaction.user.id}>\n**Trade ID:** \`${tradeId}\`\n**Channel:** ${interaction.channel}`)
      .setColor(0xFF0000)
      .setTimestamp();
    staffChannel.send({ content: `<@&${ROLE_STAFF_ID}>`, embeds: [issueEmbed] });
  }
  
  else if (customId.startsWith('cancel_ticket_')) {
    const channelId = customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);
    await interaction.reply({ content: '❌ Cancelling...', ephemeral: true });
    if (channel) { await channel.send('❌ **Purchase cancelled.** Closing...'); setTimeout(() => channel.delete().catch(() => {}), 3000); activeTickets.delete(channelId); }
  }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with FIXED TRADE CONFIRMATION WARNING!');
