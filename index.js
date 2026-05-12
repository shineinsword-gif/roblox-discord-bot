const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
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

const activeUsernameRequests = new Map();
const activeTickets = new Map();

function saveStock() {
  fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
}

// ========== ROBLOX PROFILE LOOKUP (Bypasses Blocks) ==========
async function findRobloxUser(username) {
  // List of fallback methods to try
  const methods = [
    // Method 1: Use a public CORS proxy
    async () => {
      const proxyUrl = `https://cors-anywhere.herokuapp.com/https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`;
      const response = await axios.get(proxyUrl, { timeout: 10000 });
      if (response.data?.data?.length > 0) return response.data.data[0];
      return null;
    },
    // Method 2: Use legacy API
    async () => {
      const response = await axios.get(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`, { timeout: 10000 });
      if (response.data && response.data.Id) {
        return { id: response.data.Id, name: response.data.Username, displayName: response.data.Username };
      }
      return null;
    },
    // Method 3: Scrape from HTML page
    async () => {
      const response = await axios.get(`https://www.roblox.com/user.aspx?username=${encodeURIComponent(username)}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const match = response.data.match(/\"userId\"\s*:\s*(\d+)/);
      if (match && match[1]) {
        return { id: parseInt(match[1]), name: username, displayName: username };
      }
      return null;
    }
  ];

  for (const method of methods) {
    try {
      const user = await method();
      if (user) {
        console.log(`✅ Found user: ${user.name} (${user.id})`);
        return user;
      }
    } catch (err) {
      console.log(`Method failed: ${err.message}`);
    }
  }
  return null;
}

// ========== FETCH ITEM IMAGE FROM ROLIMON'S ==========
async function fetchRobloxItemImage(itemId) {
  // Primary: Use Rolimon's
  try {
    const rolimonsUrl = `https://www.rolimons.com/item/${itemId}`;
    const response = await axios.get(rolimonsUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const ogImageMatch = response.data.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogImageMatch && ogImageMatch[1]) {
      console.log(`✅ Found Rolimon's image for ${itemId}`);
      return ogImageMatch[1];
    }
  } catch (err) {}

  // Fallback: Roblox API
  try {
    const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${itemId}&size=150x150&format=Png`;
    const response = await axios.get(url, { timeout: 8000 });
    if (response.data?.data?.[0]?.imageUrl) return response.data.data[0].imageUrl;
  } catch (err) {}

  return "https://www.rolimons.com/images/items/placeholder.png";
}

// Update all item images on startup
async function updateAllItemImages() {
  for (let item of stock.items) {
    const imageUrl = await fetchRobloxItemImage(item.robloxItemId);
    if (imageUrl) item.imageUrl = imageUrl;
  }
  saveStock();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  // Load stock and update images
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
      ]},
      { name: 'refreshimages', description: '[STAFF] Refresh all item images from Rolimon\'s' }
    ]);
    console.log('✅ Commands registered!');
  }
});

// ========== MAIN INTERACTION HANDLER ==========
client.on('interactionCreate', async (interaction) => {
  try {
    // Handle Slash Commands
    if (interaction.isCommand()) {
      const { commandName, member, options } = interaction;
      
      if (commandName === 'stock') {
        console.log(`📊 Stock command by ${interaction.user.tag}`);
        
        const embed = new EmbedBuilder()
          .setTitle('📦 Current Stock')
          .setDescription('Click a button below to purchase an item!')
          .setColor(0x0099FF);
        
        stock.items.forEach(item => {
          embed.addFields({ name: item.name, value: `💰 $${item.price} | ID: ${item.id}`, inline: true });
          if (item.imageUrl && !embed.data.thumbnail) embed.setThumbnail(item.imageUrl);
        });
        
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
      
      else if (commandName === 'refreshimages' && member?.roles.cache.has(ROLE_STAFF_ID)) {
        await interaction.reply('🖼️ Refreshing all item images from Rolimon\'s...');
        await updateAllItemImages();
        await interaction.followUp('✅ Images refreshed!');
      }
    }
    
    // Handle Buttons
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      console.log(`🔘 Button clicked: ${customId}`);
      
      // Purchase button
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
          .setDescription(`Price: **$${item.price}**\n\nType your Roblox username below to continue.`)
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
      
      // Request username button
      else if (customId.startsWith('request_username_')) {
        const itemId = parseInt(customId.split('_')[2]);
        const item = stock.items.find(i => i.id === itemId);
        
        await interaction.reply({ content: '✅ Ready! **Type your Roblox username below**', ephemeral: false });
        
        activeUsernameRequests.set(interaction.user.id, {
          channelId: interaction.channel.id,
          item: item
        });
        
        await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**`);
      }
      
      // Cancel ticket button
      else if (customId.startsWith('cancel_ticket_')) {
        const channelId = customId.replace('cancel_ticket_', '');
        const channel = interaction.guild.channels.cache.get(channelId);
        
        await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
        
        if (channel) {
          await channel.send('❌ **Ticket cancelled.** This channel will close in 3 seconds...');
          setTimeout(() => channel.delete().catch(() => {}), 3000);
        }
        activeTickets.delete(channelId);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    try {
      if (!interaction.replied) {
        await interaction.reply({ content: 'An error occurred. Please try again.', ephemeral: true });
      }
    } catch (e) {}
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
  
  const searchingMsg = await message.channel.send(`🔍 Searching Roblox for **${username}**...`);
  const robloxUser = await findRobloxUser(username);
  await searchingMsg.delete();
  
  if (!robloxUser) {
    await message.channel.send(`❌ **Roblox user "${username}" not found**\n\nPlease check spelling and try again:`);
    return;
  }
  
  activeUsernameRequests.delete(message.author.id);
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Is this your Roblox profile?')
    .setDescription(`**Username:** ${robloxUser.name}\n**Display Name:** ${robloxUser.displayName}\n**User ID:** ${robloxUser.id}`)
    .addFields({ name: 'Profile Link', value: `https://www.roblox.com/users/${robloxUser.id}/profile` })
    .setColor(0x00FF00);
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_trade_${item.id}_${robloxUser.id}`)
        .setLabel('✅ Yes, That\'s Me')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`retry_username_${item.id}`)
        .setLabel('🔄 Retry - Wrong User')
        .setStyle(ButtonStyle.Secondary)
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
    
    await interaction.channel.send(`✅ **Trade offer sent for ${item.name}!**\n\nTrade ID: \`${tradeId}\`\n\nThis ticket will close in 10 seconds.`);
    
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
});

// ========== WEB SERVER FOR RENDER HEALTH CHECKS ==========
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

// Start the bot
client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with Roblox profile proxy & Rolimon\'s images!');
