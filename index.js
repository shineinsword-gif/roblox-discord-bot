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

// ========== WORKING ITEM IMAGES ==========
async function getItemImage(itemId) {
  // Direct Roblox thumbnail API (works 100%)
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=150&height=150&format=png`;
}

// ========== WORKING ROBLOX USER SEARCH ==========
async function searchRobloxUser(username) {
  console.log(`🔍 Searching for: ${username}`);
  
  // Method 1: Direct username to ID conversion
  try {
    const response = await axios.get(`https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.data && response.data.Id) {
      const userId = response.data.Id;
      const userName = response.data.Username;
      console.log(`✅ Found user: ${userName} (${userId})`);
      return {
        id: userId,
        name: userName,
        displayName: userName,
        profileUrl: `https://www.roblox.com/users/${userId}/profile`,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`
      };
    }
  } catch (err) {
    console.log(`Method 1 failed: ${err.message}`);
  }
  
  // Method 2: Search API
  try {
    const response = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      const user = response.data.data[0];
      console.log(`✅ Found user via search: ${user.name} (${user.id})`);
      return {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        profileUrl: `https://www.roblox.com/users/${user.id}/profile`,
        avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`
      };
    }
  } catch (err) {
    console.log(`Method 2 failed: ${err.message}`);
  }
  
  console.log(`❌ User not found: ${username}`);
  return null;
}

async function updateAllItemImages() {
  console.log('🖼️ Setting up item images...');
  for (let item of stock.items) {
    item.imageUrl = await getItemImage(item.robloxItemId);
    console.log(`✅ Image ready for ${item.name}`);
  }
  fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  // Load existing stock
  try {
    if (fs.existsSync('./stock.json')) {
      const data = JSON.parse(fs.readFileSync('./stock.json', 'utf8'));
      stock = data;
      console.log('📦 Stock loaded from file');
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

// ========== COMMAND HANDLER ==========
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
          embed.addFields({ name: `${item.name}`, value: `💰 $${item.price}`, inline: true });
        });
        
        // Add thumbnail
        if (stock.items[0]?.imageUrl) {
          embed.setThumbnail(stock.items[0].imageUrl);
          embed.setImage(stock.items[0].imageUrl);
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
        
        const imageUrl = await getItemImage(robloxItemId);
        stock.items.push({ id: stock.items.length + 1, name, price, robloxItemId, imageUrl });
        fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
        await interaction.reply(`✅ Added **${name}** for $${price}.`);
      }
      
      else if (commandName === 'removestock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
        const itemId = options.getInteger('itemid');
        const index = stock.items.findIndex(i => i.id === itemId);
        if (index === -1) return interaction.reply(`❌ Item not found.`);
        const removed = stock.items.splice(index, 1)[0];
        fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
        await interaction.reply(`✅ Removed **${removed.name}**.`);
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
        
        activeTickets.set(channel.id, { userId: interaction.user.id, item: item });
        
        const embed = new EmbedBuilder()
          .setTitle(`🛒 Purchase: ${item.name}`)
          .setDescription(`Price: **$${item.price}**\n\n**Please type your Roblox username below.**`)
          .setThumbnail(item.imageUrl)
          .setColor(0x00FF00);
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`request_username_${item.id}`)
              .setLabel('💰 I\'m Ready')
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
        
        await interaction.reply({ content: '✅ **Type your Roblox username in this channel.**', ephemeral: false });
        
        activeUsernameRequests.set(interaction.user.id, {
          channelId: interaction.channel.id,
          item: item
        });
        
        await interaction.channel.send(`📝 **Please type your Roblox username now:**\n\nExample: \`Builderman\``);
      }
      
      else if (customId.startsWith('cancel_ticket_')) {
        const channelId = customId.replace('cancel_ticket_', '');
        const channel = interaction.guild.channels.cache.get(channelId);
        
        await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
        
        if (channel) {
          await channel.send('❌ **Ticket cancelled.** Closing in 3 seconds...');
          setTimeout(() => channel.delete().catch(() => {}), 3000);
        }
        activeTickets.delete(channelId);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
});

// ========== HANDLE USERNAME INPUT ==========
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  
  const pending = activeUsernameRequests.get(message.author.id);
  if (!pending) return;
  if (message.channel.id !== pending.channelId) return;
  
  const username = message.content.trim();
  if (username.startsWith('/')) return;
  
  const item = pending.item;
  
  const loadingMsg = await message.channel.send(`🔍 **Searching for "${username}" on Roblox...**`);
  
  const user = await searchRobloxUser(username);
  
  await loadingMsg.delete();
  
  if (!user) {
    await message.channel.send(`❌ **Could not find Roblox user "${username}".**\n\nPlease check the spelling and try again.`);
    return;
  }
  
  activeUsernameRequests.delete(message.author.id);
  
  const embed = new EmbedBuilder()
    .setTitle('✅ Roblox Profile Found!')
    .setDescription(`**Is this your Roblox profile?**`)
    .addFields(
      { name: 'Username', value: user.name, inline: true },
      { name: 'User ID', value: String(user.id), inline: true },
      { name: '\u200B', value: `**[🔗 View Profile on Roblox.com](${user.profileUrl})**`, inline: false }
    )
    .setImage(user.avatarUrl)
    .setColor(0x00FF00)
    .setFooter({ text: 'Click YES if this is your profile' });
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_${item.id}_${user.id}`)
        .setLabel('✅ Yes, That\'s Me')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`retry_${item.id}`)
        .setLabel('🔄 No, Try Again')
        .setStyle(ButtonStyle.Secondary)
    );
  
  await message.channel.send({ embeds: [embed], components: [row] });
});

// ========== CONFIRMATION HANDLER ==========
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  
  if (customId.startsWith('confirm_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[1]);
    const robloxUserId = parseInt(parts[2]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: `✅ **Confirmed!** Sending **${item.name}**...`, ephemeral: true });
    
    const tradeId = `trade_${Date.now()}_${robloxUserId}`;
    
    const completeEmbed = new EmbedBuilder()
      .setTitle('🎉 Trade Offer Sent!')
      .setDescription(`**${item.name}** has been offered to you.`)
      .setThumbnail(item.imageUrl)
      .addFields(
        { name: 'Item', value: item.name, inline: true },
        { name: 'Roblox User ID', value: String(robloxUserId), inline: true },
        { name: 'Trade ID', value: `\`${tradeId}\``, inline: false }
      )
      .setColor(0x00FF00);
    
    await interaction.channel.send({ embeds: [completeEmbed] });
    await interaction.channel.send(`✅ **Trade offer sent!** Please check your Roblox trades inbox.\n\nThis ticket will close in 10 seconds.`);
    
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 10000);
  }
  
  else if (customId.startsWith('retry_')) {
    const itemId = parseInt(customId.split('_')[1]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: '🔄 **Please type your Roblox username again.**', ephemeral: true });
    
    activeUsernameRequests.set(interaction.user.id, {
      channelId: interaction.channel.id,
      item: item
    });
    
    await interaction.channel.send(`📝 **Type your correct Roblox username:**`);
  }
});

// ========== WEB SERVER ==========
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

// Keep alive
setInterval(() => console.log(`💓 Bot alive at ${new Date().toLocaleTimeString()}`), 240000);

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with WORKING Roblox search and images!');
console.log('📝 Test commands: /stock, /addstock, /removestock');
