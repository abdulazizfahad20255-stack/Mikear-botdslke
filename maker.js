const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const { spawn } = require('child_process');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ملف تخزين الأرصدة والبوتات المباعة
const DB_FILE = './database.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, bots: {} }, null, 2));
}

function loadDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // تسجيل الأوامر
    const commands = [
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('إرسال لوحة تحكم الميكر وشراء البوتات'),
        new SlashCommandBuilder()
            .setName('add-coins')
            .setDescription('إضافة عملات لمستخدم (للإدارة)')
            .addUserOption(option => option.setName('user').setDescription('المستخدم').setRequired(true))
            .addIntegerOption(option => option.setName('amount').setDescription('عدد العملات').setRequired(true))
    ];

    const rest = new REST({ version: '10' }).setToken('YOUR_MAKER_BOT_TOKEN');
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error(error);
    }
});

// أمر لوحة التحكم
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'panel') {
            const embed = new EmbedBuilder()
                .setTitle('🎪 مرحباً بك في عالم البوتات المذهل')
                .setDescription('✨ اكتشف قوة التكنولوجيا مع مجموعتنا الحصرية من البوتات!\n\n👇 اختر الخدمة المطلوبة من القائمة أدناه:')
                .setColor('#2b2d31');

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('select_bot_service')
                    .setPlaceholder('🎯 اختر الخدمة المطلوبة من القائمة')
                    .addOptions([
                        {
                            label: 'شراء بوت برودكاست',
                            description: 'بوت احترافي للبرودكاست يعمل 24/7',
                            value: 'buy_broadcast_bot',
                            emoji: '🤖'
                        }
                    ])
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (interaction.commandName === 'add-coins') {
            if (!interaction.member.permissions.has('Administrator')) {
                return interaction.reply({ content: 'ليس لديك صلاحية لاستخدام هذا الأمر.', ephemeral: true });
            }
            const target = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            
            const db = loadDB();
            if (!db.users[target.id]) db.users[target.id] = { coins: 0 };
            db.users[target.id].coins += amount;
            saveDB(db);

            await interaction.reply({ content: `تم بنجاح إضافة ${amount} عملة لـ ${target.tag}. رصيده الحالي: ${db.users[target.id].coins}`, ephemeral: true });
        }
    }

    // التعامل مع اختيار القائمة المنسدلة
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'select_bot_service') {
            if (interaction.values[0] === 'buy_broadcast_bot') {
                const modal = new ModalBuilder()
                    .setCustomId('token_modal')
                    .setTitle('شراء بوت برودكاست');

                const tokenInput = new TextInputBuilder()
                    .setCustomId('bot_token_input')
                    .setLabel('أدخل توكن بوتك الجديد (Token)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('MTI3...ضع التوكن هنا')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(tokenInput));
                await interaction.showModal(modal);
            }
        }
    }

    // استقبال المودال (التوكن)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'token_modal') {
            const token = interaction.fields.getTextInputValue('bot_token_input').trim();
            const userId = interaction.user.id;
            const cost = 10; // تكلفة البوت بالعملات (مثال: 10 عملات)

            const db = loadDB();
            const userCoins = db.users[userId]?.coins || 0;

            if (userCoins < cost) {
                return interaction.reply({ 
                    content: `❌ **فشل إنشاء البوت:** ليس لديك عملات كافية للشراء. رصيدك الحالي هو (${userCoins}) وتحتاج إلى (${cost}) عملة.`, 
                    ephemeral: true 
                });
            }

            // خصم العملات
            db.users[userId].coins -= cost;
            saveDB(db);

            // إنشاء ملف فرعي للبوت الجديد
            const botFileName = `bot_${userId}_${Date.now()}.js`;
            
            // قالب كود بوت البرودكاست الذي سيعمل بشكل مستقل
            const botCode = `
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

const TOKEN = '${token}';
const OWNER_ID = '${userId}';

client.once('ready', async () => {
    console.log('Broadcast Bot logged in as ' + client.user.tag);
    const commands = [
        new SlashCommandBuilder()
            .setName('broadcast')
            .setDescription('إرسال برودكاست للأعضاء')
            .addStringOption(option => option.setName('message').setDescription('نص الرسالة المراد إرسالها').setRequired(true))
            .addRoleOption(option => option.setName('role').setDescription('إرسال لرتبة محددة (اختياري)').setRequired(false))
    ];
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (e) { console.error(e); }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'broadcast') {
        await interaction.deferReply({ ephemeral: true });
        const messageText = interaction.options.getString('message');
        const targetRole = interaction.options.getRole('role');

        let members;
        try {
            await interaction.guild.members.fetch();
            if (targetRole) {
                members = interaction.guild.members.cache.filter(m => m.roles.cache.has(targetRole.id) && !m.user.bot);
            } else {
                members = interaction.guild.members.cache.filter(m => !m.user.bot);
            }
        } catch (err) {
            return interaction.editReply({ content: '❌ حدث خطأ أثناء جلب أعضاء السيرفر. تأكد من تفعيل Server Members Intent.' });
        }

        let successCount = 0;
        let failCount = 0;

        for (const [id, member] of members) {
            try {
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('📢 رسالة برودكاست جديدة')
                    .setDescription(messageText)
                    .setFooter({ text: \`مرسل من سيرفر: \${interaction.guild.name}\`, iconURL: interaction.guild.iconURL() })
                    .setTimestamp();

                await member.send({ embeds: [embed] });
                successCount++;
            } catch (e) {
                failCount++;
            }
        }

        await interaction.editReply({ content: \`✅ تم إرسال البرودكاست بنجاح!\n- تم الإرسال إلى: \${successCount} عضو\n- فشل الإرسال لـ: \${failCount} عضو\` });
    }
});

client.login(TOKEN);
`;

            fs.writeFileSync(botFileName, botCode);

            // تشغيل البوت باستخدام Child Process ليعمل 24/7
            const child = spawn('node', [botFileName], { detached: true, stdio: 'ignore' });
            child.unref();

            // حفظ معلومات البوت في قاعدة البيانات
            db.bots[botFileName] = { userId, token, createdAt: new Date() };
            saveDB(db);

            await interaction.reply({ 
                content: `✅ **تم إنشاء وتفعيل بوت البرودكاست بنجاح!**\n- تم خصم ${cost} عملة من رصيدك.\n- البوت يعمل الآن تلقائياً ولديه أمر \`/broadcast\` لإرسال الرسائل بالخاص.`, 
                ephemeral: true 
            });
        }
    }
});

client.login(process.env.DISCORD_TOKEN.replace('X_', ''));

