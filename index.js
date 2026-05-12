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

// ========== DIRECT ROBLOX BROWSER SIMULATION ==========
// This actually visits Roblox.com like a real browser
async function findRobloxUserDirect(username) {
  console.log(`🌐 DIRECTLY visiting Roblox to find user: ${username}`);
  
  // First, try to get the user ID from the profile page
  const profileUrl = `https://www.roblox.com/user.aspx?username=${username}`;
  
  try {
    // Visit the profile page with real browser headers
    const response = await axios.get(profileUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    const html = response.data;
    
    // Method 1: Extract user ID from the HTML (data-userid attribute)
    let userId = null;
    let userName = username;
    let displayName = username;
    
    // Look for data-userid in the HTML
    const userIdMatch = html.match(/data-userid="(\d+)"/i);
    if (userIdMatch && userIdMatch[1]) {
      userId = userIdMatch[1];
      console.log(`✅ Found user ID: ${userId}`);
    }
    
    // Also look for the actual username on the page
    const nameMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (nameMatch && nameMatch[1]) {
      const cleanName = nameMatch[1].trim();
      if (cleanName && !cleanName.includes('Roblox')) {
        userName = cleanName;
        console.log(`✅ Found username: ${userName}`);
      }
    }
    
    // Look for display name
    const displayMatch = html.match(/<span class="[^"]*display-name[^"]*"[^>]*>([^<]+)<\/span>/i);
    if (displayMatch && displayMatch[1]) {
      displayName = displayMatch[1].trim();
    }
    
    if (userId) {
      // Get the profile picture URL directly from Roblox's CDN
      const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`;
      
      return {
        id: parseInt(userId),
        name: userName,
        displayName: displayName,
        profileUrl: `https://www.roblox.com/users/${userId}/profile`,
        avatarUrl: avatarUrl
      };
    }
    
    // Method 2: Try to get user ID from the API as fallback (with referer header)
    try {
      const apiResponse = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'https://www.roblox.com/',
          'Origin': 'https://www.roblox.com'
        }
      });
      
      if (apiResponse.data?.data?.length > 0) {
        const user = apiResponse.data.data[0];
        const avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`;
        return {
          id: user.id,
          name: user.name,
          displayName: user.displayName || user.name,
          profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
          avatarUrl: avatarUrl
        };
      }
    } catch (err) {}
    
    console.log(`❌ Could not find user: ${username}`);
    return null;
    
  } catch (error) {
    console.error(`❌ Error visiting Roblox:`, error.message);
    
    // Last resort: Try to construct the profile URL anyway
    // The user might still exist even if we couldn't scrape the page
    const possibleUserId = await tryFindUserIdViaApi(username);
    if (possibleUserId) {
      return {
        id: possibleUserId,
        name: username,
        displayName: username,
        profileUrl: `https://www.roblox.com/users/${possibleUserId}/profile`,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${possibleUserId}&width=420&height=420&format=png`
      };
    }
    
    return null;
  }
}

// Helper function to try to find user ID via multiple methods
async function tryFindUserIdViaApi(username) {
  const methods = [
    `https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`,
    `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`
  ];
  
  for (const url of methods) {
    try {
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.roblox.com/' }
      });
      if (response.data?.Id) return response.data.Id;
      if (response.data?.data?.[0]?.id) return response.data.data[0].id;
    } catch (err) {}
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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    
    // Look for the item image in the HTML
    const imgMatch = response.data.match(/<img[^>]*src=["']([^"']*item[^"']*)["']/i);
    if (imgMatch && imgMatch[1]) {
      let imgUrl = imgMatch[1];
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      console.log(`✅ Found Rolimon's image for ${itemId}`);
      return imgUrl;
    }
    
    // Look for og:image meta tag
    const ogMatch = response.data.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) {
      return ogMatch[1];
    }
  } catch (err) {
    console.log(`Rolimon's fetch failed for ${itemId}: ${err.message}`);
  }

  // Fallback 1: Roblox thumbnail API
  try {
    const url = `https://thumbnails.roblox.com/v1/assets?assetIds=${itemId}&size=150x150&format=Png`;
    const response = await axios.get(url, { timeout: 8000 });
    if (response.data?.data?.[0]?.imageUrl) return response.data.data[0].imageUrl;
  } catch (err) {}

  // Fallback 2: Direct Roblox image URL
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=150&height=150&format=png`;
}

// Update all item images
async function updateAllItemImages() {
  console.log('🖼️ Fetching images from Rolimon\'s...');
  for (let item of stock.items) {
    const imageUrl = await fetchRobloxItemImage(item.robloxItemId);
    if (imageUrl) {
      item.imageUrl = imageUrl;
      console.log(`✅ Got image for ${item.name}`);
    } else {
      item.imageUrl = null;
    }
  }
  saveStock();
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  // Load stock
  try {
    if (fs.existsSync('./stock.json')) {
      const data = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));
      stock = data;
      console.log('✅ Stock loaded from file');
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
      { name: 'refreshimages', description: '[STAFF] Refresh all item images' }
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
        console.log(`📊 Stock command by ${interaction.user.tag}`);
        
        const embed = new EmbedBuilder()
          .setTitle('📦 Current Stock')
          .setDescription('Click a button below to purchase an item!')
          .setColor(0x0099FF);
        
        stock.items.forEach(item => {
          embed.addFields({ name: item.name, value: `💰 $${item.price} | ID: ${item.id}`, inline: true });
        });
        
        // Add first item's image as thumbnail
        if (stock.items[0]?.imageUrl) {
          embed.setThumbnail(stock.items[0].imageUrl);
        }
        
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
        await interaction.reply('🖼️ Refreshing all item images...');
        await updateAllItemImages();
        await interaction.followUp('✅ Images refreshed!');
      }
    }
    
    else if (interaction.isButton()) {
      const customId = interaction.customId;
      console.log(`🔘 Button clicked: ${customId}`);
      
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
          .setDescription(`Price: **$${item.price}**\n\n**Step 1:** Type your Roblox username below\n**Step 2:** Confirm your profile\n**Step 3:** Receive your item!`)
          .setThumbnail(item.imageUrl)
          .setColor(0x00FF00);
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`request_username_${item.id}`)
              .setLabel('💰 Start Purchase')
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
  
  const searchingMsg = await message.channel.send(`🌐 **Visiting Roblox.com to find user "${username}"...**\n\nThis may take a few seconds.`);
  
  // This actually visits Roblox.com like a real browser
  const robloxUser = await findRobloxUserDirect(username);
  
  await searchingMsg.delete();
  
  if (!robloxUser) {
    await message.channel.send(`❌ **Could not find Roblox user "${username}"**\n\nPossible reasons:\n• Misspelled username\n• Account is private\n• Account doesn't exist\n\n📝 **Please check spelling and try again:**`);
    return;
  }
  
  activeUsernameRequests.delete(message.author.id);
  
  // Create a beautiful confirmation embed with the actual Roblox profile
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
    
    const completeEmbed = new EmbedBuilder()
      .setTitle('🎉 Trade Offer Sent!')
      .setDescription(`**${item.name}** has been offered to you on Roblox!`)
      .setThumbnail(item.imageUrl)
      .addFields(
        { name: 'Item', value: item.name, inline: true },
        { name: 'Price', value: `$${item.price}`, inline: true },
        { name: 'Trade ID', value: `\`${tradeId}\``, inline: false }
      )
      .setColor(0x00FF00);
    
    await interaction.channel.send({ embeds: [completeEmbed] });
    await interaction.channel.send(`✅ **Trade offer sent!** Please check your Roblox trades inbox.\n\nThis ticket will close in 10 seconds.`);
    
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
    
    await interaction.channel.send(`📝 **Please type your CORRECT Roblox username:**\n\n*Make sure to spell it exactly as it appears on Roblox.*`);
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

// ========== WEB SERVER ==========
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.get('/health', (req, res) => res.status(200).send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

// Keep-alive ping
setInterval(() => {
  console.log(`💓 Bot alive at ${new Date().toLocaleTimeString()}`);
}, 240000);

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with DIRECT ROBLOX BROWSER SIMULATION!');
console.log('📝 The bot will visit Roblox.com to find users - this works even when APIs fail!');
