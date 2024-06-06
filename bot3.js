const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const ExcelJS = require('exceljs');

// Configura i tuoi token qui
const DISCORD_TOKEN = 'MTI0NzgzNDk2MTY4MDAwNzE4MA.GNDIq2.RDZEtvIg6nc89brQqFJHhVb-tk-BRDz2phuBIk';
const AUTHORIZATION_TOKEN = 'nWLRC8T8d_bINy6n7zFGTB68DQdFuqo1gkjd6I2vWsbD';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const CURRENT_PID = '65e607b2ebdfdac278104759';

// Inizializza il client di Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
    console.log('Bot è online!');
});

// Funzione per effettuare la chiamata API
async function fetchItemPrice(code) {
    try {
        console.log(`Chiamata API per CODE: ${code}`); // Debug
        const response = await axios.get(`https://pixels-server.pixels.xyz/v1/marketplace/item/${code}`, {
            params: {
                pid: CURRENT_PID,
                v: String(Math.floor(Date.now() / 1000))
            },
            headers: {
                Accept: 'application/json, text/plain, */*',
                Authorization: `Bearer ${AUTHORIZATION_TOKEN}`,
                Origin: 'https://play.pixels.xyz',
                Referer: 'https://play.pixels.xyz/',
                'User-Agent': USER_AGENT
            }
        });

        console.log(`Risposta API per CODE ${code}:`, response.data); // Debug della risposta

        // Estrai il prezzo minimo dalle listings
        if (response.data && response.data.listings && response.data.listings.length > 0) {
            const prices = response.data.listings.map(listing => listing.price);
            const minPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            return minPrice;
        }

        return 'Prezzo non disponibile';
    } catch (error) {
        console.error(`Errore nella chiamata API per ${code}:`, error.response ? error.response.data : error.message);
        return 'Errore nel recupero del prezzo';
    }
}

// Funzione per trovare una riga nel foglio dati
function findItem(data, itemName) {
    return data.find(i => i.ITEM.toLowerCase() === itemName.toLowerCase());
}

// Funzione per ottenere tutte le righe degli ingredienti per un item principale
function findIngredients(data, itemName) {
    return data.filter(i => i.ITEM.toLowerCase() === itemName.toLowerCase() && i.Craftable === 'NO');
}

// Funzione per leggere i dati dal file Excel
async function readExcelData(filePath, sheetName) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(sheetName);
    
    if (!worksheet) {
        throw new Error(`Il foglio di lavoro "${sheetName}" non è stato trovato nel file Excel`);
    }

    const data = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) { // Skip header row
            data.push({
                Level: row.getCell(1).value,
                ITEM: row.getCell(2).value,
                XP: row.getCell(3).value,
                XP_Minuto: row.getCell(4).value,
                Xp_E: row.getCell(5).value,
                Drop_Percent: row.getCell(6).value,
                Count: row.getCell(7).value,
                Time: row.getCell(8).value,
                Energy_Gain: row.getCell(9).value,
                Energy_Cost: row.getCell(10).value,
                Type: row.getCell(11).value,
                CODE: row.getCell(12).value ? row.getCell(12).value.toString() : '',
                INGREDIENTI: row.getCell(13).value,
                Quantita: row.getCell(14).value,
                Craftable: row.getCell(15).value
            });
        }
    });

    return data;
}

client.on('messageCreate', async (message) => {
    if (message.content.startsWith('!price ')) {
        const itemName = message.content.slice(7).trim(); // Ottieni l'ITEM dal messaggio
        if (!itemName) {
            message.channel.send(':warning: **Per favore specifica un oggetto dopo il comando !price**');
            return;
        }

        try {
            const data = await readExcelData('All_Items.xlsx', 'Craftable_Items');
            const item = findItem(data, itemName);

            if (!item) {
                message.channel.send(`:warning: **Oggetto non trovato: ${itemName}**`);
                return;
            }

            console.log(`Oggetto trovato: ${item.ITEM}, CODE: ${item.CODE}`); // Debug

            const dryMapleCode = 'itm_dry_maple_glazed_grumpkin_slabs';
            const dryMaplePrice = await fetchItemPrice(dryMapleCode);
            const dryMapleItem = findItem(data, 'Dry Maple');
            let energyPrice = 0;

            if (dryMapleItem && dryMapleItem.Energy_Gain) {
                const energyCost = item.Energy_Cost || 0;
                const energyGain = dryMapleItem.Energy_Gain;
                energyPrice = ((dryMaplePrice / energyGain) * energyCost).toFixed(2);
            }

            if (item.Craftable === 'SI' && item.ITEM.toLowerCase() === item.INGREDIENTI.toLowerCase()) {
                const mainItemPrice = await fetchItemPrice(item.CODE);
                let messageContent = `**${item.ITEM}: :coin: ${mainItemPrice.toFixed(2)}**\n\n:regional_indicator_i: **INGREDIENTS**\n\n`;

                let totalPrice = mainItemPrice;
                const ingredients = findIngredients(data, item.ITEM);
                for (let ing of ingredients) {
                    const price = await fetchItemPrice(ing.CODE);
                    const totalIngredientPrice = (price * ing.Quantita).toFixed(2);
                    totalPrice -= totalIngredientPrice;
                    messageContent += `:small_blue_diamond: **${ing.Quantita} x ${ing.INGREDIENTI} = ${totalIngredientPrice} :coin:**\n`;
                }

                totalPrice = totalPrice.toFixed(2);
                totalPrice -= energyPrice;
                const profitEmoji = totalPrice >= 0 ? ':money_mouth:' : ':money_with_wings:';
                messageContent += `\n**:low_battery: ${item.Energy_Cost || 'N/A'} = ${energyPrice} :coin:**\n`;
                messageContent += `\n**${profitEmoji} ${totalPrice} :coin:** \n\n**:crocodile: JTG :crocodile:**`;
                message.channel.send(messageContent);
            } else if (item.Craftable === 'NO' && item.ITEM.toLowerCase() === item.INGREDIENTI.toLowerCase()) {
                const price = await fetchItemPrice(item.CODE);
                const profit = (price - energyPrice).toFixed(2);
                const profitEmoji = profit >= 0 ? ':money_mouth:' : ':money_with_wings:';
                message.channel.send(`**:small_blue_diamond: ${item.ITEM} :coin: ${price.toFixed(2)}**\n\n**:low_battery: ${item.Energy_Cost || 'N/A'} = ${energyPrice} :coin:**\n\n**${profitEmoji} ${profit} :coin:**\n\n**:crocodile: JTG :crocodile:**`);
            } else {
                message.channel.send(`:warning: **Configurazione dell'oggetto non riconosciuta: ${itemName}**`);
            }
        } catch (error) {
            console.error('Errore nella lettura del file Excel:', error);
            message.channel.send(':warning: **Errore nella lettura del file Excel**');
        }
    }
});

// Accedi al bot
client.login(DISCORD_TOKEN);
