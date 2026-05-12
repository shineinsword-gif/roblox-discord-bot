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

async function findRobloxUser(username) {
  try {
    const response = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (response.data?.data?.length > 0) {
      const user = response.data.data[0];
      return { id: user.id, name: user.name, displayName: user.displayName || user.name };
    }
    return null;
  } catch (err) {
    return null;
  }
}

// ========== SINGLE INTERACTION HANDLER ==========
client.on('interactionCreate', async (interaction) => {
  // Handle Slash Commands
  if (interaction.isCommand()) {
    const { commandName, member, options } = interaction;
    
    if (commandName === 'stock') {
      console.log(`📊 Stock command by ${interaction.user.tag}`);
      
      const embed = new EmbedBuilder()
        .setTitle('📦 Current Stock')
        .setDescription('Click a button below to purchase!')
        .setColor(0x0099FF);
      
      stock.items.forEach(item => {
        embed.addFields({ name: item.name, value: `💰 $${item.price} | ID: ${item.id}`, inline: true });
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
      
      stock.items.push({ id: stock.items.length + 1, name, price, robloxItemId });
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
  
  // Handle Buttons
  else if (interaction.isButton()) {
    const customId = interaction.customId;
    console.log(`🔘 Button clicked: ${customId} by ${interaction.user.tag}`);
    
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
        .setColor(0x00FF00);
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`request_username_${item.id}_${channel.id}`)
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
      const parts = customId.split('_');
      const itemId = parseInt(parts[2]);
      const channelId = parts[3];
      const item = stock.items.find(i => i.id === itemId);
      
      await interaction.reply({ content: '✅ Ready! **Type your Roblox username below**', ephemeral: false });
      
      activeUsernameRequests.set(interaction.user.id, {
        channelId: interaction.channel.id,
        item: item
      });
      
      await interaction.channel.send(`📝 **Please type your EXACT Roblox username:**\n\nExample: \`Builderman\``);
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
  const ticketInfo = activeTickets.get(message.channel.id);
  
  const searchingMsg = await message.channel.send(`🔍 Searching Roblox for **${username}**...`);
  const robloxUser = await findRobloxUser(username);
  await searchingMsg.delete();
  
  if (!robloxUser) {
    await message.channel.send(`❌ **Roblox user "${username}" not found**\n\nPlease check spelling and try again:`);
    return;
  }
  
  if (ticketInfo) {
    ticketInfo.robloxUserId = robloxUser.id;
    ticketInfo.robloxUsername = robloxUser.name;
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
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`cancel_ticket_${message.channel.id}`)
        .setLabel('❌ Cancel')
        .setStyle(ButtonStyle.Danger)
    );
  
  await message.channel.send({ embeds: [confirmEmbed], components: [row] });
});

// Handle confirm trade button
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  
  if (customId.startsWith('confirm_trade_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[2]);
    const robloxUserId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    const ticketInfo = activeTickets.get(interaction.channel.id);
    
    await interaction.reply({ content: `✅ **Confirmed!** Sending **${item.name}**...`, ephemeral: true });
    
    const tradeId = `trade_${Date.now()}_${robloxUserId}`;
    if (ticketInfo) ticketInfo.status = 'trade_sent';
    
    await interaction.channel.send(`✅ **Trade offer sent for ${item.name}!**\n\nTrade ID: \`${tradeId}\`\n\nThis ticket will close in 10 seconds.`);
    
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
      activeTickets.delete(interaction.channel.id);
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

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with FIXED button handlers!');
