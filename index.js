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

// Simple stock command
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  const { commandName, member, options } = interaction;
  
  if (commandName === 'stock') {
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
});

// Simple button handler for purchases
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  if (interaction.customId.startsWith('purchase_')) {
    const itemId = parseInt(interaction.customId.split('_')[1]);
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
    
    const embed = new EmbedBuilder()
      .setTitle(`🛒 Purchase: ${item.name}`)
      .setDescription(`Price: **$${item.price}**\n\nType your Roblox username below to continue.`)
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
  
  else if (interaction.customId.startsWith('cancel_ticket_')) {
    const channelId = interaction.customId.replace('cancel_ticket_', '');
    const channel = interaction.guild.channels.cache.get(channelId);
    await interaction.reply({ content: '❌ Cancelling ticket...', ephemeral: true });
    if (channel) {
      await channel.send('❌ **Ticket cancelled.** Closing...');
      setTimeout(() => channel.delete().catch(() => {}), 3000);
    }
  }
});

// Express server for Render
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with EARLY WORKING VERSION!');
