const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  
  // Register a simple test command
  const guild = client.guilds.cache.get(GUILD_ID);
  if (guild) {
    await guild.commands.set([
      { name: 'ping', description: 'Test if bot is working' },
      { name: 'stock', description: 'View current stock' }
    ]);
    console.log('✅ Commands registered!');
  }
});

// Simple command handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  console.log(`Command received: ${interaction.commandName} from ${interaction.user.tag}`);
  
  if (interaction.commandName === 'ping') {
    await interaction.reply('🏓 Pong! Bot is working!');
  }
  
  else if (interaction.commandName === 'stock') {
    const embed = new EmbedBuilder()
      .setTitle('📦 Stock')
      .setDescription('Test stock - Bot is working!')
      .setColor(0x00FF00);
    
    await interaction.reply({ embeds: [embed] });
  }
});

// Express server for Render
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web server on port ${PORT}`));

client.login(DISCORD_TOKEN);
console.log('🚀 SIMPLE TEST VERSION - Bot starting...');
