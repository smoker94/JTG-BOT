require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const ExcelJS = require('exceljs');

// Configura i tuoi token qui

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
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
            const minPrice = Math.min(...prices);
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
    return data.find(i => i.ITEM === itemName);
}

// Funzione per ottenere tutte le righe degli ingredienti per un item principale
function findIngredients(data, itemName) {
    return data.filter(i => i.ITEM === itemName && i.Craftable === 'NO');
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

            if (item.Craftable === 'SI' && item.ITEM === item.INGREDIENTI) {
                const mainItemPrice = await fetchItemPrice(item.CODE);
                let messageContent = `**${item.ITEM} - Prezzo: ${mainItemPrice}**\n\n**Ingredienti:**\n`;

                const ingredients = findIngredients(data, item.ITEM);
                for (let ing of ingredients) {
                    const price = await fetchItemPrice(ing.CODE);
                    messageContent += `- ${ing.INGREDIENTI}: **${ing.Quantita} x  ${price}** Coin\n`;
                }

                message.channel.send(`${messageContent}\n:star: **JTG** :star:`);
            } else if (item.Craftable === 'NO' && item.ITEM === item.INGREDIENTI) {
                const price = await fetchItemPrice(item.CODE);
                message.channel.send(`**${item.ITEM}**: ${price}\n Energy Cost: **${item.Energy_Cost || 'N/A'}**\n:star: **JTG** :star:`);
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
