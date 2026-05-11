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
    { 
      id: 1, 
      name: "Rainbow Phoenix", 
      price: 25, 
      robloxItemId: 101
    },
    { 
      id: 2, 
      name: "Golden Dragon", 
      price: 50, 
      robloxItemId: 102
    },
    { 
      id: 3, 
      name: "Gold Clockwork Shades", 
      price: 75, 
      robloxItemId: 110673146052704
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

// ========== ROBLOX USER LOOKUP ==========
async function findRobloxUserDirect(username) {
  try {
    console.log(`🔍 Attempting to find Roblox user: ${username}`);
    
    const searchUrl = `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(username)}&limit=10`;
    
    const response = await axios.get(searchUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      const exactMatch = response.data.data.find(user => 
        user.name.toLowerCase() === username.toLowerCase()
      );
      const user = exactMatch || response.data.data[0];
      console.log(`✅ Found user: ${user.name} (ID: ${user.id})`);
      
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
    
    // Fallback method
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
        .setDescription('Click the 🔍 button below to search for specific items')
        .setColor(0x0099FF);
      
      stock.items.slice(0, 5).forEach(item => {
        embed.addFields({
          name: `${item.name}`,
          value: `💰 $${item.price} | 🆔 ID: ${item.id}`,
          inline: true
        });
      });
      
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('search_button')
            .setLabel('🔍 Search Stock')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('view_all')
            .setLabel('📋 View All Items')
            .setStyle(ButtonStyle.Primary)
        );
      
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
      
      await interaction.reply(`✅ Added **${name}** for $${price}. Roblox ID: ${robloxItemId}`);
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
    
    // SEARCH BUTTON - Ephemeral message (only visible to the user who clicked)
    if (customId === 'search_button') {
      // Send ephemeral prompt - only the user sees this
      await interaction.reply({
        content: '🔍 **What would you like to search for?**\n\nType the item name or ID you want to find in stock.\nExample: `Gold` or `110673146052704`',
        ephemeral: true
      });
      
      // Create a message collector in the same channel, but only for this user
      const filter = m => m.author.id === interaction.user.id && m.channel.id === interaction.channel.id;
      const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 30000 });
      
      collector.on('collect', async (msg) => {
        const query = msg.content.trim();
        const results = searchStock(query);
        
        // Delete the user's search message to keep chat clean
        await msg.delete().catch(() => {});
        
        if (results.length === 0) {
          await interaction.followUp({
            content: `❌ No items found matching **"${query}"** in stock.\n\nUse \`/stock\` to see all available items.`,
            ephemeral: true
          });
          return;
        }
        
        const resultEmbed = new EmbedBuilder()
          .setTitle(`🔍 Search Results for "${query}"`)
          .setDescription(`Found ${results.length} item(s) in stock`)
          .setColor(0x00FF00);
        
        const buttons = new ActionRowBuilder();
        
        results.slice(0, 5).forEach(item => {
          resultEmbed.addFields({
            name: `${item.name}`,
            value: `💰 $${item.price} | 🆔 Stock ID: ${item.id}`,
            inline: false
          });
          
          buttons.addComponents(
            new ButtonBuilder()
              .setCustomId(`purchase_${item.id}`)
              .setLabel(`Buy ${item.name.length > 20 ? item.name.substring(0,20)+'...' : item.name}`)
              .setStyle(ButtonStyle.Primary)
          );
        });
        
        // Send results as ephemeral - only the user sees them!
        await interaction.followUp({ embeds: [resultEmbed], components: [buttons], ephemeral: true });
      });
      
      collector.on('end', (collected) => {
        if (collected.size === 0) {
          interaction.followUp({
            content: '⏰ Search timed out. Use `/stock` to try again.',
            ephemeral: true
          }).catch(() => {});
        }
      });
    }
    
    else if (customId === 'view_all') {
      const embed = new EmbedBuilder()
        .setTitle('📦 Complete Stock List')
        .setColor(0x0099FF);
      
      stock.items.forEach(item => {
        embed.addFields({
          name: `${item.name} (ID: ${item.id})`,
          value: `💰 $${item.price} | 🎮 Roblox ID: ${item.robloxItemId}`,
          inline: false
        });
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
        .setDescription(`Price: **$${item.price}**\n\n**Step 1:** Type your Roblox username below\n**Step 2:** Confirm your profile\n**Step 3:** Receive your item!`)
        .setColor(0x00FF00);
      
      await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed] });
      
      activeUsernameRequests.set(interaction.user.id, {
        channelId: channel.id,
        item: item,
        sessionId: sessionId
      });
      
      await channel.send(`📝 **Please type your EXACT Roblox username:**\n\nExample: \`Builderman\``);
    }
    
    else if (customId.startsWith('cancel_')) {
      if (interaction.channel) {
        await interaction.channel.send('❌ **Purchase cancelled.**');
        await interaction.reply({ content: 'Cancelled.', ephemeral: true });
        setTimeout(() => interaction.channel.delete(), 5000);
      }
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
        .setCustomId(`retry_username_${item.id}`)
        .setLabel('🔄 No, Wrong User')
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
    
    await interaction.channel.send(`✅ **Purchase Complete!**\n\n📦 Item: ${item.name}\n👤 Roblox User ID: ${robloxUserId}\n🆔 Transaction ID: \`${tradeId}\`\n\nThis ticket will close in 10 seconds.`);
    
    setTimeout(() => interaction.channel.delete(), 10000);
  }
  
  else if (customId.startsWith('retry_username_')) {
    const parts = customId.split('_');
    const itemId = parseInt(parts[3]);
    const item = stock.items.find(i => i.id === itemId);
    
    await interaction.reply({ content: '🔄 Please type your username again.', ephemeral: true });
    
    activeUsernameRequests.set(interaction.user.id, {
      channelId: interaction.channel.id,
      item: item
    });
    
    await interaction.channel.send(`📝 **Please type your Roblox username again:**`);
  }
});

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with EPHEMERAL search (only you can see results)!');
