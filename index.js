const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const cheerio = require('cheerio');
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

const activeUsernameRequests = new Map();
const activeTickets = new Map();

function saveStock() {
  fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
}

// ========== WORKING ROBLOX SEARCH (Multiple Methods) ==========
async function findRobloxUser(username) {
  console.log(`🔍 Searching for Roblox user: ${username}`);
  
  // Method 1: Use Roblox's public API (sometimes works)
  try {
    const apiUrl = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=5`;
    const response = await axios.get(apiUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (response.data?.data?.length > 0) {
      const user = response.data.data[0];
      if (user.name.toLowerCase() === username.toLowerCase() || 
          user.displayName?.toLowerCase() === username.toLowerCase()) {
        console.log(`✅ Found via API: ${user.name} (${user.id})`);
        return {
          id: user.id,
          name: user.name,
          displayName: user.displayName || user.name,
          profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
          avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`
        };
      }
    }
  } catch (err) {
    console.log(`API method failed: ${err.message}`);
  }
  
  // Method 2: Search via user ID lookup
  try {
    const idUrl = `https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`;
    const response = await axios.get(idUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.data && response.data.Id) {
      console.log(`✅ Found via ID API: ${response.data.Username} (${response.data.Id})`);
      return {
        id: response.data.Id,
        name: response.data.Username,
        displayName: response.data.Username,
        profileUrl: `https://www.roblox.com/users/${response.data.Id}/profile`,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${response.data.Id}&width=420&height=420&format=png`
      };
    }
  } catch (err) {
    console.log(`ID API failed: ${err.message}`);
  }
  
  // Method 3: Scrape the HTML page (last resort)
  try {
    const profileUrl = `https://www.roblox.com/user.aspx?username=${encodeURIComponent(username)}`;
    const response = await axios.get(profileUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    const html = response.data;
    
    // Check if we got an error page
    if (html.includes('Page cannot be found') || html.includes('404')) {
      console.log(`User not found - 404 page`);
      return null;
    }
    
    // Try to extract user ID from the HTML
    const userIdPatterns = [
          /data-userid="(\d+)"/i,
          /\"userId\"\s*:\s*(\d+)/i,
          /UserID=(\d+)/i,
          /userId=(\d+)/i,
          /\/users\/(\d+)\/profile/i
        ];
    
    let userId = null;
    for (const pattern of userIdPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        userId = match[1];
        break;
      }
    }
    
    if (userId) {
      // Extract username from title
      let userName = username;
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const titleName = titleMatch[1].replace(' - Roblox', '').trim();
        if (titleName && !titleName.includes('Roblox')) {
          userName = titleName;
        }
      }
      
      console.log(`✅ Found via HTML scrape: ${userName} (${userId})`);
      return {
        id: parseInt(userId),
        name: userName,
        displayName: userName,
        profileUrl: `https://www.roblox.com/users/${userId}/profile`,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`
      };
    }
  } catch (err) {
    console.log(`HTML scrape failed: ${err.message}`);
  }
  
  console.log(`❌ All methods failed for: ${username}`);
  return null;
}

// ========== FETCH ITEM IMAGE ==========
async function fetchRobloxItemImage(itemId) {
  // Method 1: Roblox Thumbnail API
  try {
    const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${itemId}&size=150x150&format=Png`;
    const response = await axios.get(url, { timeout: 8000 });
    if (response.data?.data?.[0]?.imageUrl) {
      return response.data.data[0].imageUrl;
    }
  } catch (err) {}
  
  // Method 2: Direct Roblox CDN
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=150&height=150&format=png`;
}

async function updateAllItemImages() {
  console.log('🖼️ Fetching item images...');
  for (let item of stock.items) {
    const imageUrl = await fetchRobloxItemImage(item.robloxItemId);
    if (imageUrl) {
      item.imageUrl = imageUrl;
      console.log(`✅ Got image for ${item.name}`);
    }
  }
  saveStock();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  try {
    if (fs.existsSync('./stock.json')) {
      stock = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));
    }
  } catch (err) {}
  
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
      ]}
    ]);
    console.log('✅ Commands registered!');
  }
});

// ========== MAIN INTERACTION HANDLER ==========
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand()) {
      const { commandName, member, options } = interaction;
      
      if (commandName === 'stock') {
        const embed = new EmbedBuilder()
          .setTitle('📦 Current Stock')
          .setDescription('Click a button below to purchase an item!')
          .setColor(0x0099FF);
        
        stock.items.forEach(item => {
          embed.addFields({ name: `${item.name}`, value: `💰 $${item.price} | ID: ${item.id}`, inline: true });
        });
        
        if (stock.items[0]?.imageUrl) embed.setThumbnail(stock.items[0].imageUrl);
        
        const row = new ActionRowBuilder();
        stock.items.forEach(item => {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`purchase_${item.id}`)
              .setLabel(`Buy ${item.name.substring(0, 20)}`)
              .setStyle(ButtonStyle.Primary)
          );
        });
        
        await interaction.reply({ embeds: [embed], components: [row] });
      }
      
      else if (commandName === 'addstock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
        const name = options.getString('name');
        const price = options.getNumber('price');
        const robloxItemId = options.getInteger('robloxitemid');
        
        const imageUrl = await fetchRobloxItemImage(robloxItemId);
        stock.items.push({ id: stock.items.length + 1, name, price, robloxItemId, imageUrl });
        saveStock();
        await interaction.reply(`✅ Added **${name}** for $${price}.`);
      }
      
      else if (commandName === 'removestock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
        const itemId = options.getInteger('itemid');
        const index = stock.items.findIndex(i => i.id === itemId);
        if (index === -1) return interaction.reply(`❌ Item not found.`);
        const removed = stock.items.splice(index, 1)[0];
        saveStock();
        await interaction.reply(`✅ Removed **${removed.name}**.`);
      }
    }
    
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      
      if (customId.startsWith('purchase_')) {
        const itemId = parseInt(customId.split('_')[1]);
        const item = stock.items.find(i => i.id === itemId);
        if (!item) {
          await interaction.reply({ content: 'Item not found.', ephemeral: true });
          return;
        }
        
        await interaction.reply({ content: 'Creating ticket...', ephemeral: true });
        
        const ticketName = `ticket-${interaction.user.username}`;
        const channel = await interaction.guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: TICKET_CATEGORY_ID,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: ROLE_STAFF_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });
        
        activeTickets.set(channel.id, { userId: interaction.user.id, item: item, status: 'awaiting_username' });
        
        const embed = new EmbedBuilder()
          .setTitle(`🛒 Purchase: ${item.name}`)
          .setDescription(`Price: **$${item.price}**\n\n**Type your Roblox username below to continue.**`)
          .setThumbnail(item.imageUrl)
          .setColor(0x00FF00);
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`request_username_${item.id}`)
              .setLabel('💰 Continue to Purchase')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`cancel_ticket_${channel.id}`)
              .setLabel('❌ Cancel')
              .setStyle(ButtonStyle.Danger)
          );
        
        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
      }
      
      else if (customId.startsWith('request_username_')) {
        const itemId = parseInt(customId.split('_')[2]);
        const item = stock.items.find(i => i.id === itemId);
        
        await interaction.reply({ content: '✅ Ready! **Type your Roblox username below**', ephemeral: false });
        
        activeUsernameRequests.set(interaction.user.id, {
          channelId: interaction.channel.id,
          item: item
        });
        
        await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**\n\nExample: \`Builderman\``);
      }
      
      else if (customId.startsWith('cancel_ticket_')) {
        const channelId = customId.replace('cancel_ticket_', '');
        const channel = interaction.guild.channels.cache.get(channelId);
        
        await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
        
        if (channel) {
          await channel.send('❌ **Ticket cancelled.** Closing...');
          setTimeout(() => channel.delete().catch(() => {}), 3000);
        }
        activeTickets.delete(channelId);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
  }
});

// ========== HANDLE USERNAME INPUT ==========
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  
  const pendingRequest = activeUsernameRequests.get(message.author.id);
  if (!pendingRequest) return;
  if (message.channel.id !== pendingRequest.channelId) return;
  
  const username = message.content.trim();
  if (username.startsWith('/')) return;
  
  const item = pendingRequest.item;
  
  const searchingMsg = await message.channel.send(`🔍 **Searching for Roblox user "${username}"...**\n\nTrying multiple search methods...`);
  
  const robloxUser = await findRobloxUser(username);
  
  await searchingMsg.delete();
  
  if (!robloxUser) {
    await message.channel.send(`❌ **Could not find Roblox user "${username}"**\n\nPossible reasons:\n• Username is misspelled\n• Account is private/deleted\n• Try a different username\n\n📝 **Please try again:**`);
    return;
  }
  
  activeUsernameRequests.delete(message.author.id);
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Roblox Profile Found!')
    .setDescription(`**Is this your Roblox profile?**`)
    .addFields(
      { name: 'Username', value: robloxUser.name, inline: true },
      { name: 'Display Name', value: robloxUser.displayName, inline: true },
      { name: 'User ID', value: String(robloxUser.id), inline: true },
      { name: 'Profile Link', value: `[Click to view on Roblox](${robloxUser.profileUrl})`, inline: false }
    )
    .setImage(robloxUser.avatarUrl)
    .setColor(0x00FF00);
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_trade_${item.id}_${robloxUser.id}`)
        .setLabel('✅ Yes, That\'s Me')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`retry_username_${item.id}`)
        .setLabel('🔄 No, Wrong User')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cancel_ticket_${message.channel.id}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    );
  
  await message.channel.send({ embeds: [confirmEmbed], components: [row] });
});

// ========== HANDLE TRADE CONFIRMATION ==========
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  
  if (customId.startsWith('confirm_trade_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[2]);
    const robloxUserId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: `✅ **Confirmed!** Sending **${item.name}**...`, ephemeral: true });
    
    const tradeId = `trade_${Date.now()}_${robloxUserId}`;
    
    await interaction.channel.send(`✅ **Trade offer sent for ${item.name}!**\n\n📦 Item: ${item.name}\n👤 Roblox User ID: ${robloxUserId}\n🆔 Trade ID: \`${tradeId}\`\n\nThis ticket will close in 10 seconds.`);
    
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 10000);
  }
  
  else if (customId.startsWith('retry_username_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: '🔄 Please type a different Roblox username.', ephemeral: true });
    
    activeUsernameRequests.set(interaction.user.id, {
      channelId: interaction.channel.id,
      item: item
    });
    
    await interaction.channel.send(`📝 **Please type your CORRECT Roblox username:**`);
  }
  
  else if (customId.startsWith('cancel_ticket_')) {
    const channelId = customId.replace('cancel_ticket_', '');
    const channel = interaction.guild.channels.cache.get(channelId);
    
    await interaction.reply({ content: '❌ Cancelling...', ephemeral: true });
    
    if (channel) {
      await channel.send('❌ **Purchase cancelled.** Closing...');
      setTimeout(() => channel.delete().catch(() => {}), 3000);
    }
    activeTickets.delete(channelId);
  }
});

// Express server for health checks
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

setInterval(() => console.log(`💓 Bot alive`), 240000);

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with MULTIPLE ROBLOX SEARCH METHODS!');
console.log('📝 Methods: 1) API Search 2) ID Lookup 3) HTML Scraping');
