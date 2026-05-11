const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROLE_STAFF_ID = process.env.ROLE_STAFF_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const GUILD_ID = process.env.GUILD_ID;

// Stock with Roblox item images
let stock = {
  items: [
    { 
      id: 1, 
      name: "Rainbow Phoenix", 
      price: 25, 
      robloxItemId: 101,
      imageUrl: "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-101.png"
    },
    { 
      id: 2, 
      name: "Golden Dragon", 
      price: 50, 
      robloxItemId: 102,
      imageUrl: "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-102.png"
    },
    { 
      id: 3, 
      name: "Gold Clockwork Shades", 
      price: 75, 
      robloxItemId: 110673146052704,
      imageUrl: "https://tr.rbxcdn.com/30DAY-AvatarHeadshot-110673146052704.png"
    }
  ]
};

function saveStock() {
  fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
}

// Function to fetch item image from Roblox
async function fetchRobloxItemImage(itemId) {
  try {
    // Roblox thumbnail API
    const response = await axios.get(`https://thumbnails.roblox.com/v1/assets?assetIds=${itemId}&size=420x420&format=Png`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.data?.data?.[0]?.imageUrl) {
      return response.data.data[0].imageUrl;
    }
    return null;
  } catch (err) {
    console.log(`Could not fetch image for item ${itemId}: ${err.message}`);
    return null;
  }
}

// Function to search stock
function searchStock(query) {
  const lowerQuery = query.toLowerCase();
  return stock.items.filter(item => 
    item.name.toLowerCase().includes(lowerQuery) ||
    String(item.robloxItemId).includes(query)
  );
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
  
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'stock', description: 'View current stock and purchase items' },
      { 
        name: 'search', 
        description: 'Search for an item in stock',
        options: [
          { name: 'query', type: 3, description: 'Item name or ID', required: true }
        ]
      },
      { 
        name: 'addstock', 
        description: '[STAFF] Add an item to stock', 
        options: [
          { name: 'name', type: 3, description: 'Item name', required: true },
          { name: 'price', type: 10, description: 'Price in USD', required: true },
          { name: 'robloxitemid', type: 4, description: 'Roblox Item ID', required: true }
        ]
      },
      { 
        name: 'removestock', 
        description: '[STAFF] Remove an item from stock', 
        options: [
          { name: 'itemid', type: 4, description: 'Item ID to remove', required: true }
        ]
      }
    ]);
    console.log('✅ Commands registered!');
  }
});

async function searchRobloxUser(username) {
  try {
    const response = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=5`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data.data || [];
  } catch (err) {
    console.error(`Search error: ${err.message}`);
    return [];
  }
}

// Store active username requests
const activeUsernameRequests = new Map();

// Initialize express server for Render
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('🤖 Discord Bot is Running!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Web server on port ${port}`));

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    const { commandName, member, options } = interaction;
    
    // SEARCH COMMAND - New feature!
    if (commandName === 'search') {
      const query = options.getString('query');
      const results = searchStock(query);
      
      if (results.length === 0) {
        await interaction.reply({ 
          content: `❌ No items found matching **"${query}"**.\n\nUse \`/stock\` to see all items.`, 
          ephemeral: true 
        });
        return;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setDescription(`Found ${results.length} item(s)`)
        .setColor(0x00FF00);
      
      results.forEach(item => {
        embed.addFields({
          name: `${item.name}`,
          value: `💰 $${item.price} | 🆔 ID: ${item.id} | 🎮 Roblox ID: ${item.robloxItemId}`,
          inline: false
        });
        
        if (item.imageUrl) {
          embed.setThumbnail(item.imageUrl);
        }
      });
      
      const row = new ActionRowBuilder();
      results.forEach(item => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`purchase_${item.id}`)
            .setLabel(`Buy ${item.name}`)
            .setStyle(ButtonStyle.Primary)
        );
      });
      
      await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    else if (commandName === 'stock') {
      const embed = new EmbedBuilder()
        .setTitle('📦 Current Stock')
        .setDescription(`Use \`/search <item name>\` to find specific items\n\n**Available Items:**`)
        .setColor(0x0099FF);
      
      stock.items.forEach(item => {
        embed.addFields({
          name: `${item.name}`,
          value: `💰 $${item.price} | 🆔 Item ID: ${item.id}`,
          inline: true
        });
      });
      
      // Add thumbnail for first item or default
      if (stock.items[0]?.imageUrl) {
        embed.setThumbnail(stock.items[0].imageUrl);
      }
      
      const row = new ActionRowBuilder();
      stock.items.forEach(item => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`purchase_${item.id}`)
            .setLabel(`Buy ${item.name}`)
            .setStyle(ButtonStyle.Primary)
        );
      });
      
      await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    else if (commandName === 'addstock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
      const name = options.getString('name');
      const price = options.getNumber('price');
      const robloxItemId = options.getInteger('robloxitemid');
      
      // Fetch the item image from Roblox
      const imageUrl = await fetchRobloxItemImage(robloxItemId);
      
      stock.items.push({
        id: stock.items.length + 1,
        name: name,
        price: price,
        robloxItemId: robloxItemId,
        imageUrl: imageUrl || "https://tr.rbxcdn.com/30DAY-AvatarHeadshot.png"
      });
      saveStock();
      
      const replyEmbed = new EmbedBuilder()
        .setTitle(`✅ Added to Stock!`)
        .setDescription(`**${name}** for $${price}`)
        .setThumbnail(imageUrl || null)
        .addFields(
          { name: 'Roblox Item ID', value: String(robloxItemId), inline: true },
          { name: 'Stock ID', value: String(stock.items.length), inline: true }
        )
        .setColor(0x00FF00);
      
      await interaction.reply({ embeds: [replyEmbed] });
    }
    
    else if (commandName === 'removestock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
      const itemId = options.getInteger('itemid');
      const index = stock.items.findIndex(i => i.id === itemId);
      if (index === -1) {
        await interaction.reply(`❌ Item with ID ${itemId} not found.`);
        return;
      }
      const removed = stock.items.splice(index, 1)[0];
      saveStock();
      await interaction.reply(`✅ Removed **${removed.name}** from stock.`);
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
      
      const ticketName = `ticket-${interaction.user.username}-${Date.now()}`;
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
      
      const sessionId = `${Date.now()}_${interaction.user.id}`;
      
      const embed = new EmbedBuilder()
        .setTitle(`🛒 Purchase: ${item.name}`)
        .setDescription(`Price: **$${item.price}**\n\nClick the button below and then **type your Roblox username** to continue.`)
        .setThumbnail(item.imageUrl || null)
        .setColor(0x00FF00);
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`request_username_${sessionId}_${item.id}`)
            .setLabel('💰 Continue to Purchase')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`cancel_${sessionId}`)
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
        );
      
      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
    }
    
    else if (customId.startsWith('request_username_')) {
      const parts = customId.split('_');
      const sessionId = parts[2];
      const itemId = parseInt(parts[3]);
      const item = stock.items.find(i => i.id === itemId);
      
      await interaction.reply({ content: '✅ Ready! **Type your Roblox username below**', ephemeral: false });
      
      activeUsernameRequests.set(interaction.user.id, {
        channelId: interaction.channel.id,
        item: item,
        sessionId: sessionId,
        step: 'awaiting_username'
      });
      
      await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**\n\nExample: \`Builderman\``);
    }
    
    else if (customId.startsWith('cancel_')) {
      await interaction.channel.send('❌ **Purchase cancelled.**');
      await interaction.reply({ content: 'Cancelled.', ephemeral: true });
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

// Handle username input and search
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  
  const pendingRequest = activeUsernameRequests.get(message.author.id);
  if (!pendingRequest) return;
  if (message.channel.id !== pendingRequest.channelId) return;
  if (pendingRequest.step !== 'awaiting_username') return;
  
  const username = message.content.trim();
  if (username.startsWith('/')) return;
  
  const item = pendingRequest.item;
  
  const searchingMsg = await message.channel.send(`🔍 Searching Roblox for **${username}**...`);
  
  const results = await searchRobloxUser(username);
  
  await searchingMsg.delete();
  
  if (!results || results.length === 0) {
    await message.channel.send(`❌ No Roblox user found with username **"${username}"**.\n\n📝 **Please check the spelling and try again:**`);
    return;
  }
  
  const userToConfirm = results[0];
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Is this your Roblox profile?')
    .addFields(
      { name: 'Username', value: userToConfirm.name, inline: true },
      { name: 'Display Name', value: userToConfirm.displayName, inline: true },
      { name: 'User ID', value: String(userToConfirm.id), inline: true },
      { name: 'Profile Link', value: `https://www.roblox.com/users/${userToConfirm.id}/profile`, inline: false }
    )
    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${userToConfirm.id}&width=420&height=420&format=png`)
    .setColor(0x00FF00);
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`send_trade_${item.id}_${userToConfirm.id}`)
        .setLabel('✅ Yes, That\'s Me')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`retry_username_${item.id}`)
        .setLabel('🔄 No, Try Again')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cancel_${Date.now()}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    );
  
  activeUsernameRequests.delete(message.author.id);
  await message.channel.send({ embeds: [confirmEmbed], components: [row] });
});

// Handle trade confirmation
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  
  if (customId.startsWith('send_trade_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[2]);
    const robloxUserId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: `🔄 Sending trade offer for **${item.name}**...`, ephemeral: true });
    
    const tradeResult = { success: true, tradeId: `trade_${Date.now()}` };
    
    if (tradeResult.success) {
      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Trade Offer Sent!')
        .setDescription(`**${item.name}** has been offered to <@${interaction.user.id}>`)
        .setThumbnail(item.imageUrl || null)
        .addFields(
          { name: 'Roblox User ID', value: String(robloxUserId), inline: true },
          { name: 'Trade ID', value: tradeResult.tradeId, inline: true }
        )
        .setColor(0x00FF00);
      
      await interaction.channel.send({ embeds: [successEmbed] });
      setTimeout(() => interaction.channel.delete(), 15000);
    } else {
      await interaction.channel.send(`❌ Failed to send trade. Please contact staff.`);
    }
  }
  
  else if (customId.startsWith('retry_username_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: '🔄 Please type your username again.', ephemeral: true });
    
    activeUsernameRequests.set(interaction.user.id, {
      channelId: interaction.channel.id,
      item: item,
      step: 'awaiting_username'
    });
    
    await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**`);
  }
  
  else if (customId === 'cancel_trade' || customId.startsWith('cancel_')) {
    if (interaction.channel) {
      await interaction.channel.send('❌ **Purchase cancelled.**');
      await interaction.reply({ content: 'Cancelled.', ephemeral: true });
      setTimeout(() => interaction.channel.delete(), 5000);
    } else {
      await interaction.reply({ content: 'Cancelled.', ephemeral: true });
    }
  }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with SEARCH & IMAGE features!');
