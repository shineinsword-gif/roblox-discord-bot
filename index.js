const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ROLE_STAFF_ID = process.env.ROLE_STAFF_ID;
const TICKET_CATEGORY_ID = process.env.TICKET_CATEGORY_ID;
const GUILD_ID = process.env.GUILD_ID;

let stock = {
  items: [
    { id: 1, name: "Rainbow Phoenix", price: 25, robloxItemId: 101, imageUrl: "https://www.rolimons.com/images/items/placeholder.png" },
    { id: 2, name: "Golden Dragon", price: 50, robloxItemId: 102, imageUrl: "https://www.rolimons.com/images/items/placeholder.png" },
    { id: 3, name: "Gold Clockwork Shades", price: 75, robloxItemId: 110673146052704, imageUrl: "https://www.rolimons.com/images/items/placeholder.png" }
  ]
};

const activeTickets = new Map();

function saveStock() {
  fs.writeFileSync('./stock.json', JSON.stringify(stock, null, 2));
}

// Fetch item image from Rolimon's
async function fetchRobloxItemImage(itemId) {
  try {
    const axios = require('axios');
    const rolimonsUrl = `https://www.rolimons.com/item/${itemId}`;
    const response = await axios.get(rolimonsUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const ogMatch = response.data.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) return ogMatch[1];
  } catch (err) {}
  return `https://www.roblox.com/asset-thumbnail/image?assetId=${itemId}&width=150&height=150&format=png`;
}

// Update all item images
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
          embed.addFields({ name: item.name, value: `💰 $${item.price}`, inline: true });
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
        
        activeTickets.set(channel.id, { userId: interaction.user.id, item: item, status: 'awaiting_roblox_link' });
        
        const embed = new EmbedBuilder()
          .setTitle(`🛒 Purchase: ${item.name}`)
          .setDescription(`Price: **$${item.price}**\n\n**Please provide your Roblox profile link.**`)
          .setThumbnail(item.imageUrl)
          .setColor(0x00FF00);
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`provide_link_${item.id}`)
              .setLabel('📎 Provide Roblox Profile Link')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`cancel_ticket_${channel.id}`)
              .setLabel('❌ Cancel')
              .setStyle(ButtonStyle.Danger)
          );
        
        await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
      }
      
      else if (customId.startsWith('provide_link_')) {
        const itemId = parseInt(customId.split('_')[2]);
        const item = stock.items.find(i => i.id === itemId);
        
        // Create a modal for Roblox link input
        const modal = new ModalBuilder()
          .setCustomId(`roblox_link_modal_${item.id}`)
          .setTitle('Enter Your Roblox Profile');
        
        const linkInput = new TextInputBuilder()
          .setCustomId('roblox_link')
          .setLabel('Roblox Profile Link or Username')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Example: https://www.roblox.com/users/123456/profile OR Builderman')
          .setRequired(true);
        
        modal.addComponents(new ActionRowBuilder().addComponents(linkInput));
        await interaction.showModal(modal);
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
    
    // Handle modal submit (Roblox link)
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('roblox_link_modal_')) {
      const itemId = parseInt(interaction.customId.split('_')[3]);
      const item = stock.items.find(i => i.id === itemId);
      const robloxInput = interaction.fields.getTextInputValue('roblox_link');
      
      // Extract user ID or username from input
      let robloxUserId = null;
      let robloxUsername = robloxInput;
      
      // Check if it's a full URL
      const urlMatch = robloxInput.match(/roblox\.com\/users\/(\d+)/i);
      if (urlMatch && urlMatch[1]) {
        robloxUserId = urlMatch[1];
        robloxUsername = `User ID: ${robloxUserId}`;
      }
      
      const ticketInfo = activeTickets.get(interaction.channel.id);
      if (ticketInfo) {
        ticketInfo.robloxUserId = robloxUserId || robloxInput;
        ticketInfo.robloxUsername = robloxInput;
        ticketInfo.status = 'awaiting_staff_verification';
      }
      
      // Notify staff for verification
      const staffChannel = interaction.guild.channels.cache.find(c => c.name === 'staff-tickets') || interaction.channel;
      
      const staffEmbed = new EmbedBuilder()
        .setTitle('🛑 MANUAL VERIFICATION REQUIRED')
        .setDescription(`**Customer:** <@${interaction.user.id}>\n**Item:** ${item.name}\n**Price:** $${item.price}\n**Roblox Info:** ${robloxInput}`)
        .addFields({ name: 'Instructions', value: '1. Verify this is the correct Roblox profile\n2. Click "Approve" to send the trade\n3. Or click "Deny" to reject' })
        .setColor(0xFF6600);
      
      const staffRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`approve_trade_${item.id}_${interaction.channel.id}_${encodeURIComponent(robloxInput)}`)
            .setLabel('✅ Approve & Send Trade')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`deny_trade_${interaction.channel.id}`)
            .setLabel('❌ Deny')
            .setStyle(ButtonStyle.Danger)
        );
      
      await staffChannel.send({ content: `<@&${ROLE_STAFF_ID}>`, embeds: [staffEmbed], components: [staffRow] });
      
      await interaction.reply({ 
        content: `✅ **Roblox profile received!**\n\nA staff member will verify your profile and send your **${item.name}** shortly.\n\nPlease wait...`, 
        ephemeral: false 
      });
      
      await interaction.channel.send(`📝 **Profile submitted:** ${robloxInput}\n\n⏳ Waiting for staff approval...`);
    }
    
    // Staff approval button
    else if (interaction.isButton() && customId.startsWith('approve_trade_')) {
      const parts = customId.split('_');
      const itemId = parseInt(parts[2]);
      const channelId = parts[3];
      const robloxInput = decodeURIComponent(parts[4]);
      const item = stock.items.find(i => i.id === itemId);
      const ticketChannel = interaction.guild.channels.cache.get(channelId);
      
      await interaction.reply({ content: `✅ **Trade approved!** Sending **${item.name}**...`, ephemeral: true });
      
      const tradeId = `trade_${Date.now()}`;
      
      if (ticketChannel) {
        await ticketChannel.send(`✅ **Your purchase has been approved!**\n\n📦 Item: ${item.name}\n👤 Roblox: ${robloxInput}\n🆔 Trade ID: \`${tradeId}\`\n\n> A staff member will send your trade. Please check your Roblox trades inbox.\n\nThis ticket will close in 30 seconds.`);
        
        setTimeout(() => {
          ticketChannel.delete().catch(() => {});
        }, 30000);
      }
      
      activeTickets.delete(channelId);
    }
    
    else if (interaction.isButton() && customId.startsWith('deny_trade_')) {
      const channelId = customId.split('_')[2];
      const ticketChannel = interaction.guild.channels.cache.get(channelId);
      
      await interaction.reply({ content: '❌ **Trade denied.**', ephemeral: true });
      
      if (ticketChannel) {
        await ticketChannel.send('❌ **Your purchase was denied.** Please contact support for more information.\n\nThis ticket will close in 10 seconds.');
        setTimeout(() => {
          ticketChannel.delete().catch(() => {});
        }, 10000);
      }
      
      activeTickets.delete(channelId);
    }
    
  } catch (error) {
    console.error('Interaction error:', error);
  }
});

// Express server
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

setInterval(() => console.log(`💓 Bot alive`), 240000);

client.login(DISCORD_TOKEN);
console.log('🚀 Bot starting with MANUAL VERIFICATION SYSTEM!');
console.log('📝 Customers provide their Roblox profile link, staff verifies manually.');
