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
      { 
        name: 'stock', 
        description: 'View current stock and purchase items' 
      },
      { 
        name: 'addstock', 
        description: '[STAFF] Add an item to stock', 
        options: [
          { name: 'name', type: 3, description: 'Item name', required: true },
          { name: 'price', type: 10, description: 'Price in USD', required: true },
          { name: 'robloxitemid', type: 4, description: 'Roblox Item ID', required: true },
          { name: 'imageurl', type: 3, description: 'Image URL (optional)', required: false }
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

// Roblox user lookup
async function findRobloxUserDirect(username) {
  try {
    console.log(`🔍 Looking up: ${username}`);
    
    const searchUrl = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`;
    
    const response = await axios.get(searchUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      const exactMatch = response.data.data.find(user => 
        user.name.toLowerCase() === username.toLowerCase()
      );
      const user = exactMatch || response.data.data[0];
      console.log(`✅ Found: ${user.name} (${user.id})`);
      
      return {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        profileUrl: `https://www.roblox.com/users/${user.id}/profile`
      };
    }
    
    return null;
    
  } catch (error) {
    console.error(`❌ Roblox API Error:`, error.message);
    
    try {
      const altUrl = `https://api.roblox.com/users/get-by-username?username=${encodeURIComponent(username)}`;
      const altResponse = await axios.get(altUrl, { timeout: 10000 });
      
      if (altResponse.data && altResponse.data.Id) {
        return {
          id: altResponse.data.Id,
          name: altResponse.data.Username,
          displayName: altResponse.data.Username,
          profileUrl: `https://www.roblox.com/users/${altResponse.data.Id}/profile`
        };
      }
    } catch (altError) {}
    
    return null;
  }
}

// Search stock function
function searchStock(query) {
  const lowerQuery = query.toLowerCase();
  return stock.items.filter(item => 
    item.name.toLowerCase().includes(lowerQuery) ||
    String(item.robloxItemId).includes(query) ||
    String(item.id).includes(query)
  );
}

// Store active requests
const activeUsernameRequests = new Map();
let activeTicketChannels = new Map();

// Initialize express server for Render
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('🤖 Discord Bot is Running!'));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🌐 Web server on port ${port}`));

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    const { commandName, member, options } = interaction;
    
    if (commandName === 'stock') {
      const embed = new EmbedBuilder()
        .setTitle('📦 Current Stock')
        .setDescription('Click a button below to browse or search')
        .setColor(0x0099FF);
      
      // Add items with images
      stock.items.forEach(item => {
        embed.addFields({
          name: `${item.name}`,
          value: `💰 $${item.price} | 🆔 ID: ${item.id}`,
          inline: true
        });
        if (item.imageUrl && !embed.data.thumbnail) {
          embed.setThumbnail(item.imageUrl);
        }
      });
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('search_modal_button')
            .setLabel('🔍 Search Stock')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('view_all_items')
            .setLabel('📋 View All Items')
            .setStyle(ButtonStyle.Secondary)
        );
      
      await interaction.reply({ embeds: [embed], components: [row] });
    }
    
    else if (commandName === 'addstock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
      const name = options.getString('name');
      const price = options.getNumber('price');
      const robloxItemId = options.getInteger('robloxitemid');
      const imageUrl = options.getString('imageurl') || `https://tr.rbxcdn.com/30DAY-AvatarHeadshot-${robloxItemId}.png`;
      
      stock.items.push({
        id: stock.items.length + 1,
        name: name,
        price: price,
        robloxItemId: robloxItemId,
        imageUrl: imageUrl
      });
      saveStock();
      
      const embed = new EmbedBuilder()
        .setTitle(`✅ Added to Stock!`)
        .setDescription(`**${name}** for $${price}`)
        .setThumbnail(imageUrl)
        .addFields(
          { name: 'Roblox Item ID', value: String(robloxItemId), inline: true },
          { name: 'Stock ID', value: String(stock.items.length), inline: true }
        )
        .setColor(0x00FF00);
      
      await interaction.reply({ embeds: [embed] });
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
  
  // Handle MODAL submit (popup search)
  else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'search_modal') {
      const query = interaction.fields.getTextInputValue('search_query');
      const results = searchStock(query);
      
      if (results.length === 0) {
        await interaction.reply({
          content: `❌ No items found matching **"${query}"** in stock.`,
          ephemeral: true
        });
        return;
      }
      
      const resultEmbed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setDescription(`Found ${results.length} item(s) in stock`)
        .setColor(0x00FF00);
      
      const buttons = new ActionRowBuilder();
      
      results.forEach(item => {
        resultEmbed.addFields({
          name: `${item.name}`,
          value: `💰 $$${item.price} | 🆔 Stock ID: ${item.id}`,
          inline: false
        });
        
        if (item.imageUrl && !resultEmbed.data.thumbnail) {
          resultEmbed.setThumbnail(item.imageUrl);
        }
        
        buttons.addComponents(
          new ButtonBuilder()
            .setCustomId(`purchase_${item.id}`)
            .setLabel(`Buy ${item.name.length > 20 ? item.name.substring(0,20)+'...' : item.name}`)
            .setStyle(ButtonStyle.Primary)
        );
      });
      
      await interaction.reply({ embeds: [resultEmbed], components: [buttons], ephemeral: true });
    }
  }
  
  else if (interaction.isButton()) {
    const customId = interaction.customId;
    
    // SEARCH MODAL BUTTON - Opens popup
    if (customId === 'search_modal_button') {
      const modal = new ModalBuilder()
        .setCustomId('search_modal')
        .setTitle('🔍 Search Stock');
      
      const searchInput = new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Enter item name or ID to search')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Example: Gold Clockwork Shades or 110673146052704')
        .setRequired(true);
      
      const actionRow = new ActionRowBuilder().addComponents(searchInput);
      modal.addComponents(actionRow);
      
      await interaction.showModal(modal);
    }
    
    else if (customId === 'view_all_items') {
      const embed = new EmbedBuilder()
        .setTitle('📦 Complete Stock List')
        .setColor(0x0099FF);
      
      stock.items.forEach(item => {
        embed.addFields({
          name: `${item.name} (ID: ${item.id})`,
          value: `💰 $${item.price} | 🎮 Roblox ID: ${item.robloxItemId}`,
          inline: false
        });
        if (item.imageUrl && !embed.data.thumbnail) {
          embed.setThumbnail(item.imageUrl);
        }
      });
      
      const row = new ActionRowBuilder();
      stock.items.slice(0, 5).forEach(item => {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`purchase_${item.id}`)
            .setLabel(`Buy ${item.name.substring(0, 20)}`)
            .setStyle(ButtonStyle.Primary)
        );
      });
      
      await interaction.update({ embeds: [embed], components: [row] });
    }
    
    else if (customId.startsWith('purchase_')) {
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
      
      // Store ticket channel for cleanup
      activeTicketChannels.set(channel.id, { userId: interaction.user.id, itemId: item.id });
      
      const embed = new EmbedBuilder()
        .setTitle(`🛒 Purchase: ${item.name}`)
        .setDescription(`Price: **$${item.price}**`)
        .setThumbnail(item.imageUrl || null)
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
    
    // CANCEL TICKET - Closes the ticket
    else if (customId.startsWith('cancel_ticket_')) {
      const channelId = customId.split('_')[2];
      const channel = interaction.guild.channels.cache.get(channelId);
      
      await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
      
      if (channel) {
        await channel.send('❌ **Ticket cancelled by user.** This channel will close in 3 seconds...');
        setTimeout(() => channel.delete().catch(() => {}), 3000);
      }
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
  }
});

// Handle username input
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
  
  const robloxUser = await findRobloxUserDirect(username);
  
  await searchingMsg.delete();
  
  if (!robloxUser) {
    await message.channel.send(`❌ **Roblox user "${username}" not found**\n\n📝 Please check spelling and try again:`);
    return;
  }
  
  activeUsernameRequests.delete(message.author.id);
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Is this your Roblox profile?')
    .setDescription(`**Username:** ${robloxUser.name}\n**Display Name:** ${robloxUser.displayName}\n**User ID:** ${robloxUser.id}`)
    .addFields({ name: '🔗 Profile Link', value: robloxUser.profileUrl, inline: false })
    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUser.id}&width=420&height=420&format=png`)
    .setColor(0x00FF00);
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm_trade_${item.id}_${robloxUser.id}`)
        .setLabel('✅ Yes, That\'s Me')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel_ticket_${message.channel.id}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    );
  
  await message.channel.send({ embeds: [confirmEmbed], components: [row] });
});

// Handle confirmations
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
    
    await interaction.channel.send(`✅ **Purchase Complete!**\n\n📦 Item: ${item.name}\n👤 Roblox User: <@${interaction.user.id}>\n🆔 Transaction ID: \`${tradeId}\`\n\nThis ticket will close in 10 seconds.`);
    
    setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
  }
  
  else if (customId.startsWith('cancel_ticket_')) {
    const channelId = customId.split('_')[2];
    const channel = interaction.guild.channels.cache.get(channelId);
    
    await interaction.reply({ content: '❌ Cancelling...', ephemeral: true });
    
    if (channel) {
      await channel.send('❌ **Purchase cancelled.** This channel will close in 3 seconds...');
      setTimeout(() => channel.delete().catch(() => {}), 3000);
    }
  }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with MODAL POPUP search, FIXED buttons, and IMAGES!');
