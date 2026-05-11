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
    { id: 3, name: "Mystic Sword", price: 15, robloxItemId: 103 }
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

async function getRobloxUserByUsername(username, retryCount = 0) {
  if (retryCount >= 3) return null;
  if (retryCount > 0) {
    await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
  }
  
  try {
    const response = await axios.get(`https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=1`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.data?.data?.length > 0) {
      const user = response.data.data[0];
      return { id: user.id, name: user.name, displayName: user.displayName };
    }
    return null;
  } catch (err) {
    if (err.response?.status === 429) {
      return getRobloxUserByUsername(username, retryCount + 1);
    }
    return null;
  }
}

async function sendRobloxTradeOffer(recipientUserId, itemId) {
  console.log(`📦 Trade: Item ${itemId} to user ${recipientUserId}`);
  return { success: true, tradeId: `trade_${Date.now()}` };
}

const activeUsernameRequests = new Map();

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand()) {
    const { commandName, member, options } = interaction;
    
    if (commandName === 'stock') {
      const embed = new EmbedBuilder()
        .setTitle('📦 Current Stock')
        .setColor(0x0099FF);
      
      let description = '';
      stock.items.forEach(item => {
        description += `**${item.name}** - $${item.price}\n`;
      });
      embed.setDescription(description || 'No items in stock.');
      
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
      
      stock.items.push({
        id: stock.items.length + 1,
        name: name,
        price: price,
        robloxItemId: robloxItemId
      });
      saveStock();
      await interaction.reply(`✅ Added **${name}** for $${price}.`);
    }
    
    else if (commandName === 'removestock' && member?.roles.cache.has(ROLE_STAFF_ID)) {
      const itemId = options.getInteger('itemid');
      const index = stock.items.findIndex(i => i.id === itemId);
      if (index === -1) {
        await interaction.reply(`❌ Item not found.`);
        return;
      }
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
      
      const sessionId = `${Date.now()}_${interaction.user.id}`;
      
      const embed = new EmbedBuilder()
        .setTitle(`🛒 Purchase: ${item.name}`)
        .setDescription(`Price: **$${item.price}**\n\nClick the button below to continue.\n\nThen enter your **Roblox username** when asked.`)
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
      
      await interaction.reply({ content: '✅ Ready! **Please type your Roblox username in this channel.**', ephemeral: false });
      
      activeUsernameRequests.set(interaction.user.id, {
        channelId: interaction.channel.id,
        item: item,
        sessionId: sessionId
      });
      
      await interaction.channel.send(`📝 **Please type your Roblox username below.**`);
    }
    
    else if (customId.startsWith('cancel_')) {
      await interaction.channel.send('❌ **Purchase cancelled.**');
      await interaction.reply({ content: 'Cancelled.', ephemeral: true });
      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;
  
  const pendingRequest = activeUsernameRequests.get(message.author.id);
  if (!pendingRequest) return;
  if (message.channel.id !== pendingRequest.channelId) return;
  
  const username = message.content.trim();
  const item = pendingRequest.item;
  
  const statusMsg = await message.channel.send(`🔍 Looking up Roblox user **${username}**...`);
  
  const robloxUser = await getRobloxUserByUsername(username);
  
  if (!robloxUser) {
    await statusMsg.edit(`❌ Roblox user **"${username}"** was not found.\n\n📝 **Please try again with your exact Roblox username:**`);
    return;
  }
  
  activeUsernameRequests.delete(message.author.id);
  await statusMsg.delete();
  
  const confirmEmbed = new EmbedBuilder()
    .setTitle('✅ Is this your Roblox profile?')
    .setDescription(`**Username:** ${robloxUser.name}\n**Display Name:** ${robloxUser.displayName}\n**User ID:** ${robloxUser.id}`)
    .setThumbnail(`https://www.roblox.com/headshot-thumbnail/image?userId=${robloxUser.id}&width=420&height=420&format=png`)
    .setColor(0x00FF00);
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`send_trade_${item.id}_${robloxUser.id}`)
        .setLabel('✅ Yes, Send My Item')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`cancel_trade`)
        .setLabel('❌ No, Wrong User')
        .setStyle(ButtonStyle.Danger)
    );
  
  await message.channel.send({ embeds: [confirmEmbed], components: [row] });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  
  const customId = interaction.customId;
  
  if (customId.startsWith('send_trade_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[2]);
    const robloxUserId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: `🔄 Sending trade offer...`, ephemeral: true });
    
    const tradeResult = await sendRobloxTradeOffer(robloxUserId, item.robloxItemId);
    
    if (tradeResult.success) {
      await interaction.channel.send(`✅ **Trade offer sent!** Trade ID: \`${tradeResult.tradeId}\``);
      setTimeout(() => interaction.channel.delete(), 15000);
    } else {
      await interaction.channel.send(`❌ Failed to send trade. Please contact staff.`);
    }
  }
  
  else if (customId === 'cancel_trade') {
    await interaction.channel.send('❌ **Trade cancelled.**');
    await interaction.reply({ content: 'Cancelled.', ephemeral: true });
    setTimeout(() => interaction.channel.delete(), 5000);
  }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting...');
